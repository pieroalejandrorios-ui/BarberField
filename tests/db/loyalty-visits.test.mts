import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

async function correct(visitId: string, items = [{ service_id: cut, quantity: 2 }], user: string = USERS.worker.id, reason = "Cantidad incorrecta", attendant: string = USERS.worker.id) {
  return as(user, "select public.correct_visit($1, $2::jsonb, $3, $4)", [visitId, JSON.stringify(items), attendant, reason]);
}
async function voidVisit(visitId: string, user: string = USERS.worker.id, reason = "Registro duplicado") {
  return as(user, "select public.void_last_visit($1, $2, $3)", [customer, reason, visitId]);
}

describe("etapa 7: corrección y anulación", () => {
  test("trabajador corrige con precios históricos y líneas nuevas actuales sin cambiar progreso", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10" });
    const v = await registerVisit();
    await as(USERS.owner.id, "update public.services set price = 99, name = 'Nuevo nombre' where id = $1", [cut]);
    await correct(v.visit_id, [{ service_id: cut, quantity: 2 }, { service_id: beard, quantity: 1 }]);
    const l = await lines(v.visit_id);
    assert.equal(l[0].unit_price, "20.00");
    assert.equal(l[0].service_name, "Corte clásico");
    assert.equal(l[1].unit_price, "15.50");
    assert.equal((await loyalty()).progress, 1);
    const [audit] = await as<{ changes: { before: { items: unknown[] }; after: { items: unknown[] } }; actor_id: string; reason: string }>(USERS.owner.id,
      "select changes, actor_id, reason from public.audit_events where action = 'visit_corrected'");
    assert.equal(audit.actor_id, USERS.worker.id);
    assert.equal(audit.reason, "Cantidad incorrecta");
    assert.equal(audit.changes.before.items.length, 1);
    assert.equal(audit.changes.after.items.length, 2);
    assert(!JSON.stringify(audit.changes).includes("00123456"));
    assert.equal((await as(USERS.worker.id, "select * from public.audit_events")).length, 0);
    assert.equal((await as(USERS.ownerB.id, "select * from public.audit_events where organization_id = $1", [orgA])).length, 0);
  });
  for (const rewardType of ["percent_discount", "fixed_discount", "free_service", "custom_benefit"] as const) {
    test(`corrección recalcula ${rewardType} con términos congelados`, async () => {
      await saveProgram({ rewardType, visitsRequired: 1, percent: "25", amount: "30", serviceId: cut, description: "Beneficio" });
      const v = await registerVisit({ apply: true });
      await saveProgram({ rewardType: "percent_discount", percent: "90" });
      await correct(v.visit_id);
      const expected = rewardType === "percent_discount" ? "10.00" : rewardType === "fixed_discount" ? "30.00" : rewardType === "free_service" ? "20.00" : "0.00";
      assert.equal((await rewardStatus(v.redeemed_reward_id!)).discount_applied, expected);
      assert.equal((await lines(v.visit_id))[0].discount, expected);
      assert.equal((await loyalty()).progress, 0);
    });
  }
  test("rechaza quitar servicio gratis y revierte toda la corrección", async () => {
    await saveProgram({ rewardType: "free_service", visitsRequired: 1, serviceId: cut });
    const v = await registerVisit({ apply: true });
    await assert.rejects(correct(v.visit_id, [{ service_id: beard, quantity: 1 }]), hasSqlState("PT015"));
    assert.equal((await lines(v.visit_id))[0].service_name, "Corte clásico");
    assert.equal((await as(USERS.owner.id, "select * from public.audit_events where action = 'visit_corrected'")).length, 0);
  });
  test("exige motivo, cantidades válidas, servicios únicos y miembro activo", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10" });
    const v = await registerVisit();
    await assert.rejects(correct(v.visit_id, undefined, USERS.worker.id, "  "), hasSqlState("22023"));
    await assert.rejects(correct(v.visit_id, [{ service_id: cut, quantity: 0 }]), hasSqlState("22023"));
    await assert.rejects(correct(v.visit_id, [{ service_id: cut, quantity: 1 }, { service_id: cut.toUpperCase(), quantity: 1 }]), hasSqlState("22023"));
    await assert.rejects(correct(v.visit_id, undefined, USERS.worker.id, "Cambio", USERS.ownerB.id), hasSqlState("22023"));
    await as(USERS.owner.id, "update public.services set archived_at = now() where id = $1", [cut]);
    await assert.rejects(correct(v.visit_id), hasSqlState("PT011"));
  });
  test("rechaza servicios de otro negocio o no disponibles en el local", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10" });
    const v = await registerVisit();
    const foreign = await addService("Ajeno", "10", orgB, USERS.ownerB.id);
    await assert.rejects(correct(v.visit_id, [{ service_id: foreign, quantity: 1 }]), hasSqlState("PT011"));
    await db.query("update public.service_locations set is_available = false where service_id = $1", [cut]);
    await assert.rejects(correct(v.visit_id), hasSqlState("PT011"));
  });
  test("anular revierte punto y los reintentos no anulan la visita anterior ni duplican eventos", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10" });
    const [first, last] = await visits(2);
    await assert.rejects(voidVisit(first.visit_id), hasSqlState("PT017"));
    await assert.rejects(voidVisit(last.visit_id, USERS.worker.id, ""), hasSqlState("22023"));
    await voidVisit(last.visit_id);
    await voidVisit(last.visit_id);
    assert.equal((await loyalty()).progress, 1);
    const rows = (await db.query<{ status: string }>("select status from public.visits order by customer_seq")).rows;
    assert.deepEqual(rows.map(v => v.status), ["completed", "voided"]);
    assert.equal((await db.query("select * from public.loyalty_events where type = 'reversal'")).rows.length, 1);
    assert.equal((await db.query("select * from public.audit_events where action = 'visit_voided'")).rows.length, 1);
    await assert.rejects(correct(last.visit_id), hasSqlState("PT016"));
  });
  for (const apply of [false, true]) {
    test(`anula ciclo completado (canje inmediato ${apply}), reabre en N-1 y permite ganar de nuevo`, async () => {
      await saveProgram({ rewardType: "percent_discount", percent: "10", visitsRequired: 2 });
      await registerVisit();
      const completed = await registerVisit({ apply });
      await voidVisit(completed.visit_id);
      assert.equal((await loyalty()).progress, 1);
      assert.equal((await rewardStatus(completed.issued_reward_id!)).status, "voided");
      assert.equal((await db.query("select * from public.loyalty_cycles where status = 'voided'")).rows.length, 1);
      const again = await registerVisit({ apply: true });
      assert(again.issued_reward_id);
      assert.notEqual(again.issued_reward_id, completed.issued_reward_id);
      assert.equal(again.customer_seq, 3);
      await voidVisit(again.visit_id);
      assert.equal((await loyalty()).progress, 1);
    });
  }
  test("restaura premio pendiente aplicado y permite anular su emisión después", async () => {
    await saveProgram({ rewardType: "fixed_discount", amount: "15", visitsRequired: 1 });
    const issued = await registerVisit();
    const redeemed = await registerVisit({ pendingRewardId: issued.issued_reward_id! });
    await assert.rejects(voidVisit(issued.visit_id), hasSqlState("PT017"));
    await voidVisit(redeemed.visit_id);
    assert.equal((await rewardStatus(issued.issued_reward_id!)).status, "available");
    assert.equal((await rewardStatus(redeemed.issued_reward_id!)).status, "voided");
    await voidVisit(issued.visit_id);
    assert.equal((await loyalty()).progress, 0);
    assert.equal((await rewardStatus(issued.issued_reward_id!)).status, "voided");
  });
  test("si premio emitido conserva un canje posterior la reversión se rechaza", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10", visitsRequired: 1 });
    const issued = await registerVisit();
    const used = await registerVisit({ pendingRewardId: issued.issued_reward_id! });
    // Simula estado inconsistente de una carga administrativa: nunca revocar
    // silenciosamente un beneficio que aún figura canjeado en otra visita.
    await db.query("update public.visits set status='voided', voided_at=now(), voided_by=$2, void_reason='Importación' where id=$1", [used.visit_id, USERS.owner.id]);
    await assert.rejects(voidVisit(issued.visit_id), hasSqlState("PT018"));
    assert.equal((await rewardStatus(issued.issued_reward_id!)).status, "redeemed");
  });
  test("pausa: anular canje devuelve premio sin restar un punto inexistente", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10", visitsRequired: 1 });
    const issued = await registerVisit();
    await saveProgram({ rewardType: "percent_discount", percent: "10", status: "paused" });
    const v = await registerVisit({ pendingRewardId: issued.issued_reward_id! });
    await voidVisit(v.visit_id);
    assert.equal((await loyalty()).progress, 0);
    assert.equal((await rewardStatus(issued.issued_reward_id!)).status, "available");
  });
  test("dueño puede corregir y anular; anónimos, ajenos y desactivados no", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10" });
    const v = await registerVisit();
    for (const user of [null, USERS.ownerB.id, USERS.outsider.id]) {
      await assert.rejects(as(user, "select public.correct_visit($1, '[]', $2, 'Cambio')", [v.visit_id, USERS.owner.id]), denied);
      await assert.rejects(as(user, "select public.void_last_visit($1, 'Cambio', $2)", [customer, v.visit_id]), denied);
    }
    await as(USERS.owner.id, "select public.set_worker_active($1, $2, false)", [orgA, USERS.worker.id]);
    await assert.rejects(correct(v.visit_id), denied);
    await assert.rejects(voidVisit(v.visit_id), denied);
    await correct(v.visit_id, undefined, USERS.owner.id, "Cambio", USERS.owner.id);
    await voidVisit(v.visit_id, USERS.owner.id);
  });
});

const USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000f1", email: "duena@norte.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000f2", email: "barbero@norte.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000f3", email: "dueno@sur.pe" },
  outsider: { id: "00000000-0000-4000-8000-0000000000f4", email: "nadie@correo.pe" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const invalid = hasSqlState(SQLSTATE.invalidParameterValue);

type ProgramOptions = {
  rewardType: "free_service" | "percent_discount" | "fixed_discount" | "custom_benefit";
  visitsRequired?: number;
  serviceId?: string;
  percent?: string;
  amount?: string;
  description?: string;
  publicText?: string;
  status?: "active" | "paused";
};

type VisitOptions = {
  items?: Array<{ service_id: string; quantity: number }>;
  apply?: boolean;
  pendingRewardId?: string | null;
  key?: string;
  attendedBy?: string | null;
  barbershopId?: string;
  customerId?: string;
};

type VisitResult = {
  visit_id: string;
  customer_seq: number;
  subtotal: string;
  discount_total: string;
  total: string;
  counted: boolean;
  progress: number | null;
  visits_required: number | null;
  issued_reward_id: string | null;
  issued_reward_status: string | null;
  redeemed_reward_id: string | null;
  replayed: boolean;
};

type Loyalty = {
  configured: boolean;
  program_status: string | null;
  progress: number;
  visits_required: number | null;
  next_visit_completes: boolean;
  reward: { type: string; service_name: string | null; percent: string | null; amount: string | null } | null;
  available_rewards: Array<{ id: string; type: string }>;
  last_visit: { customer_seq: number; total: string } | null;
};

let db: PGlite;
let orgA: string;
let orgB: string;
let shopA: string;
let shopB: string;
let cut: string; // Corte 20.00
let beard: string; // Barba 15.50
let wash: string; // Lavado 0.00
let customer: string;

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function addService(name: string, price: string, organizationId = orgA, userId: string = USERS.owner.id): Promise<string> {
  const [row] = await as<{ id: string }>(
    userId,
    "insert into public.services (organization_id, name, price) values ($1, $2, $3) returning id",
    [organizationId, name, price],
  );
  return row.id;
}

async function addCustomer(dni: string, organizationId = orgA, userId: string = USERS.owner.id): Promise<string> {
  const [row] = await as<{ id: string }>(
    userId,
    `insert into public.customers (organization_id, full_name, dni, phone, consent_by)
     values ($1, 'Cliente ' || $2, $2, '987654321', $3) returning id`,
    [organizationId, dni, userId],
  );
  return row.id;
}

async function saveProgram(options: ProgramOptions, userId: string = USERS.owner.id, organizationId = orgA): Promise<string> {
  const args: string[] = ["p_organization_id => $1", "p_reward_type => $2"];
  const params: unknown[] = [organizationId, options.rewardType];
  const optional: Array<[string, unknown]> = [
    ["p_visits_required", options.visitsRequired],
    ["p_reward_service_id", options.serviceId],
    ["p_reward_percent", options.percent],
    ["p_reward_amount", options.amount],
    ["p_reward_description", options.description],
    ["p_public_text", options.publicText],
    ["p_status", options.status],
  ];
  for (const [name, value] of optional) {
    if (value === undefined) continue;
    params.push(value);
    args.push(`${name} => $${params.length}`);
  }
  const [row] = await as<{ id: string }>(userId, `select public.save_loyalty_program(${args.join(", ")}) as id`, params);
  return row.id;
}

async function registerVisit(options: VisitOptions = {}, userId: string = USERS.worker.id): Promise<VisitResult> {
  const [row] = await as<VisitResult>(
    userId,
    `select visit_id, customer_seq, subtotal::text, discount_total::text, total::text, counted, progress,
            visits_required, issued_reward_id, issued_reward_status::text, redeemed_reward_id, replayed
     from public.register_visit($1, $2, $3::jsonb, $4, $5, $6, $7)`,
    [
      options.barbershopId ?? shopA,
      options.customerId ?? customer,
      JSON.stringify(options.items ?? [{ service_id: cut, quantity: 1 }]),
      options.attendedBy ?? null,
      options.apply ?? false,
      options.pendingRewardId ?? null,
      options.key ?? randomUUID(),
    ],
  );
  return row;
}

async function loyalty(customerId = customer, userId: string = USERS.worker.id): Promise<Loyalty> {
  const [row] = await as<{ data: Loyalty }>(userId, "select public.get_customer_loyalty($1) as data", [customerId]);
  return row.data;
}

async function visits(times: number, options: VisitOptions = {}): Promise<VisitResult[]> {
  const results: VisitResult[] = [];
  for (let i = 0; i < times; i += 1) results.push(await registerVisit(options));
  return results;
}

async function lines(visitId: string): Promise<Array<{ service_name: string; unit_price: string; quantity: number; gross: string; discount: string; net: string }>> {
  return (
    await db.query<{ service_name: string; unit_price: string; quantity: number; gross: string; discount: string; net: string }>(
      `select service_name, unit_price::text, quantity, gross::text, discount::text, net::text
       from public.visit_items where visit_id = $1 order by position`,
      [visitId],
    )
  ).rows;
}

async function rewardStatus(rewardId: string): Promise<{ status: string; redeemed_visit_id: string | null; discount_applied: string | null }> {
  const { rows } = await db.query<{ status: string; redeemed_visit_id: string | null; discount_applied: string | null }>(
    "select status::text, redeemed_visit_id, discount_applied::text from public.rewards where id = $1",
    [rewardId],
  );
  return rows[0];
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  [{ id: orgA }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte', 'Calle 1', 'norte', '2026-10-01') as id");
  [{ id: orgB }] = await as<{ id: string }>(USERS.ownerB.id, "select public.create_business('Sur', 'Calle 2', 'sur', '2026-10-01') as id");
  await as(USERS.owner.id, "select * from public.add_worker_by_email($1, $2)", [orgA, USERS.worker.email]);
  [{ id: shopA }] = (await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [orgA])).rows;
  [{ id: shopB }] = (await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [orgB])).rows;

  cut = await addService("Corte clásico", "20.00");
  beard = await addService("Barba", "15.50");
  wash = await addService("Lavado", "0.00");
  customer = await addCustomer("00123456");
});

describe("seguridad", () => {
  const tables = ["loyalty_programs", "loyalty_cycles", "visits", "visit_items", "rewards", "loyalty_events", "audit_events"];

  test("un anónimo no lee las tablas nuevas ni ejecuta las funciones", async () => {
    for (const table of tables) {
      await assert.rejects(as(null, `select * from public.${table}`), denied, table);
    }
    await assert.rejects(as(null, "select public.get_customer_loyalty($1)", [customer]), denied);
    await assert.rejects(
      as(null, "select * from public.register_visit($1, $2, '[]', null, false, null, $3)", [shopA, customer, randomUUID()]),
      denied,
    );
    await assert.rejects(as(null, "select public.save_loyalty_program($1, 'custom_benefit')", [orgA]), denied);
  });

  test("nadie escribe directamente en visitas, premios, ciclos, eventos ni auditoría", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10" });
    const { visit_id } = await registerVisit();

    const writes = [
      ["insert into public.loyalty_programs (organization_id, reward_type, reward_percent) values ($1, 'percent_discount', 50)", [orgA]],
      ["update public.loyalty_programs set visits_required = 1", []],
      ["insert into public.visits (organization_id, barbershop_id, customer_id, attended_by, created_by, customer_seq, subtotal, total, idempotency_key, request_hash) values ($1, $2, $3, $4, $4, 99, 0, 0, gen_random_uuid(), 'x')", [orgA, shopA, customer, USERS.owner.id]],
      ["update public.visits set total = 0, subtotal = 0", []],
      ["delete from public.visits", []],
      ["update public.visit_items set unit_price = 0", []],
      ["update public.loyalty_cycles set progress = 4", []],
      ["insert into public.loyalty_events (organization_id, customer_id, type, delta, created_by) values ($1, $2, 'progress', 1, $3)", [orgA, customer, USERS.owner.id]],
      ["insert into public.audit_events (organization_id, actor_id, action, entity) values ($1, $2, 'visit_voided', 'visit')", [orgA, USERS.owner.id]],
      ["update public.rewards set status = 'available'", []],
    ] as const;
    for (const [sql, params] of writes) {
      await assert.rejects(as(USERS.owner.id, sql, [...params]), denied, sql);
    }

    // Tampoco las funciones `security definer` reescriben el historial.
    await assert.rejects(db.query("delete from public.loyalty_events"), denied);
    await assert.rejects(db.query("update public.audit_events set reason = 'x'"), denied);

    const [{ count }] = (await db.query<{ count: number }>("select count(*)::int as count from public.visits")).rows;
    assert.equal(count, 1);
    assert.ok(visit_id);
  });

  test("el trabajador consulta el premio y las visitas, pero no configura el premio ni lee la auditoría", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
    await registerVisit();

    await assert.rejects(saveProgram({ rewardType: "percent_discount", percent: "50" }, USERS.worker.id), denied);
    assert.equal((await as(USERS.worker.id, "select * from public.loyalty_programs")).length, 1);
    assert.equal((await as(USERS.worker.id, "select * from public.visits")).length, 1);
    assert.equal((await as(USERS.worker.id, "select * from public.audit_events")).length, 0);
    assert.equal((await as(USERS.owner.id, "select * from public.audit_events")).length, 1);
  });

  test("otro negocio no ve ni registra nada, aunque sea del mismo dueño y conozca los IDs", async () => {
    await saveProgram({ rewardType: "custom_benefit", description: "Lavado gratis" });
    await registerVisit();

    // Segundo negocio del mismo dueño, con su propia promoción.
    const [{ id: orgC }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte 2', 'Calle 3', 'norte-dos', '2026-10-01') as id");
    const [{ id: shopC }] = (await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [orgC])).rows;
    const cutC = await addService("Corte", "20.00", orgC);
    await saveProgram({ rewardType: "custom_benefit", description: "Otro" }, USERS.owner.id, orgC);

    // El cliente de Norte no puede recibir visitas en Norte 2, ni con sus servicios.
    await assert.rejects(registerVisit({ barbershopId: shopC, items: [{ service_id: cutC, quantity: 1 }] }, USERS.owner.id), invalid);
    await assert.rejects(registerVisit({ items: [{ service_id: cutC, quantity: 1 }] }, USERS.owner.id), hasSqlState(SQLSTATE.serviceUnavailable));

    for (const user of [USERS.ownerB.id, USERS.outsider.id]) {
      await assert.rejects(registerVisit({}, user), denied);
      await assert.rejects(loyalty(customer, user), denied);
      for (const table of ["visits", "visit_items", "rewards", "loyalty_cycles", "loyalty_events", "loyalty_programs", "audit_events"]) {
        assert.equal((await as(user, `select * from public.${table} where organization_id = $1`, [orgA])).length, 0, table);
      }
    }
    // El dueño B no registra en su local a un cliente de Norte.
    await saveProgram({ rewardType: "custom_benefit", description: "Sur" }, USERS.ownerB.id, orgB);
    await assert.rejects(registerVisit({ barbershopId: shopB }, USERS.ownerB.id), invalid);
  });

  test("un trabajador desactivado pierde el acceso", async () => {
    await saveProgram({ rewardType: "custom_benefit", description: "Café" });
    await as(USERS.owner.id, "select public.set_worker_active($1, $2, false)", [orgA, USERS.worker.id]);

    await assert.rejects(registerVisit(), denied);
    await assert.rejects(loyalty(), denied);
    assert.equal((await as(USERS.worker.id, "select * from public.loyalty_programs")).length, 0);
  });

  test("«atendido por» debe ser un miembro activo del negocio", async () => {
    await saveProgram({ rewardType: "custom_benefit", description: "Café" });
    const visit = await registerVisit({ attendedBy: USERS.owner.id });
    const { rows } = await db.query<{ attended_by: string; created_by: string }>(
      "select attended_by, created_by from public.visits where id = $1",
      [visit.visit_id],
    );
    assert.deepEqual(rows[0], { attended_by: USERS.owner.id, created_by: USERS.worker.id });

    await assert.rejects(registerVisit({ attendedBy: USERS.ownerB.id }), invalid);
    await as(USERS.owner.id, "select public.set_worker_active($1, $2, false)", [orgA, USERS.worker.id]);
    await assert.rejects(registerVisit({ attendedBy: USERS.worker.id }, USERS.owner.id), invalid);
  });
});

describe("configuración del premio", () => {
  test("meta por defecto 5 y metas distintas", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
    assert.equal((await loyalty()).visits_required, 5);

    for (const visitsRequired of [1, 10, 50]) {
      await saveProgram({ rewardType: "free_service", serviceId: cut, visitsRequired });
      const [{ visits_required }] = (await db.query<{ visits_required: number }>("select visits_required from public.loyalty_programs")).rows;
      assert.equal(visits_required, visitsRequired);
    }
    for (const visitsRequired of [0, 51]) {
      await assert.rejects(saveProgram({ rewardType: "free_service", serviceId: cut, visitsRequired }), invalid);
    }
  });

  test("valida la combinación de tipo y valor", async () => {
    const rejected: ProgramOptions[] = [
      { rewardType: "free_service" },
      { rewardType: "percent_discount" },
      { rewardType: "percent_discount", percent: "0" },
      { rewardType: "percent_discount", percent: "100.01" },
      { rewardType: "percent_discount", percent: "10.555" },
      { rewardType: "fixed_discount", amount: "0" },
      { rewardType: "fixed_discount", amount: "-5" },
      { rewardType: "custom_benefit", description: "   " },
      { rewardType: "custom_benefit", description: "x".repeat(201) },
      { rewardType: "custom_benefit", description: "Café", publicText: "x".repeat(201) },
    ];
    for (const options of rejected) {
      await assert.rejects(saveProgram(options), invalid, JSON.stringify(options));
    }

    // Un servicio archivado o de otro negocio no puede ser el premio.
    await as(USERS.owner.id, "update public.services set archived_at = now() where id = $1", [beard]);
    await assert.rejects(saveProgram({ rewardType: "free_service", serviceId: beard }), hasSqlState(SQLSTATE.serviceUnavailable));
    const otherService = await addService("Corte Sur", "10.00", orgB, USERS.ownerB.id);
    await assert.rejects(saveProgram({ rewardType: "free_service", serviceId: otherService }), hasSqlState(SQLSTATE.serviceUnavailable));

    // Los valores que no corresponden al tipo se descartan.
    await saveProgram({ rewardType: "percent_discount", percent: "100", amount: "5", serviceId: cut });
    const { rows } = await db.query<{ reward_percent: string; reward_amount: string | null; reward_service_id: string | null }>(
      "select reward_percent::text, reward_amount::text, reward_service_id from public.loyalty_programs",
    );
    assert.deepEqual(rows[0], { reward_percent: "100.00", reward_amount: null, reward_service_id: null });
  });

  test("sin promoción configurada no se registran visitas", async () => {
    assert.equal((await loyalty()).configured, false);
    await assert.rejects(registerVisit(), hasSqlState(SQLSTATE.programNotConfigured));
  });

  test("editar la promoción no cambia ciclos abiertos ni premios emitidos", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut, visitsRequired: 2, publicText: "Cada 2, corte gratis" });
    const other = await addCustomer("87654321");

    // Cliente 1: gana un premio pendiente y abre un ciclo nuevo con 1 visita.
    const [, second] = await visits(2);
    await registerVisit();
    // Cliente 2: 1 visita en su ciclo.
    await registerVisit({ customerId: other });

    await saveProgram({ rewardType: "percent_discount", percent: "50", visitsRequired: 10 });

    const first = await loyalty();
    assert.equal(first.visits_required, 2);
    assert.equal(first.progress, 1);
    assert.equal(first.reward?.type, "free_service");
    assert.equal(first.reward?.service_name, "Corte clásico");
    assert.equal(first.available_rewards[0].type, "free_service");
    assert.equal(first.available_rewards[0].id, second.issued_reward_id);

    // Renombrar el servicio no cambia los términos congelados.
    await as(USERS.owner.id, "update public.services set name = 'Corte premium' where id = $1", [cut]);
    assert.equal((await loyalty(other)).reward?.service_name, "Corte clásico");

    // El ciclo de 2 se completa con sus reglas originales; el siguiente usa las nuevas.
    const closing = await registerVisit({ customerId: other });
    assert.equal(closing.issued_reward_id !== null, true);
    const after = await loyalty(other);
    assert.equal(after.visits_required, 10);
    assert.equal(after.reward?.type, "percent_discount");
    assert.equal(after.reward?.percent, "50.00");
  });

  test("la configuración queda en la auditoría sin datos personales", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
    await saveProgram({ rewardType: "fixed_discount", amount: "10" });
    const rows = await as<{ action: string; changes: { before: { reward_type: string } | null; after: { reward_type: string } } }>(
      USERS.owner.id,
      "select action, changes from public.audit_events order by created_at, id",
    );
    assert.equal(rows.length, 2);
    assert.equal(rows.every((r) => r.action === "loyalty_program_saved"), true);
    const types = rows.map((r) => [r.changes.before?.reward_type ?? null, r.changes.after.reward_type]);
    assert.deepEqual(types.sort(), [[null, "free_service"], ["free_service", "fixed_discount"]].sort());
  });
});

describe("visitas y progreso", () => {
  beforeEach(async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
  });

  test("una visita con varios servicios suma 1 y congela nombres y precios", async () => {
    const visit = await registerVisit({ items: [{ service_id: cut, quantity: 2 }, { service_id: beard, quantity: 1 }] });
    assert.equal(visit.counted, true);
    assert.equal(visit.progress, 1);
    assert.equal(visit.customer_seq, 1);
    assert.equal(visit.subtotal, "55.50");
    assert.equal(visit.total, "55.50");
    assert.deepEqual(await lines(visit.visit_id), [
      { service_name: "Corte clásico", unit_price: "20.00", quantity: 2, gross: "40.00", discount: "0.00", net: "40.00" },
      { service_name: "Barba", unit_price: "15.50", quantity: 1, gross: "15.50", discount: "0.00", net: "15.50" },
    ]);

    const second = await registerVisit();
    assert.equal(second.customer_seq, 2);
    assert.equal(second.progress, 2);
  });

  test("cambiar el precio o el nombre no altera visitas anteriores", async () => {
    const visit = await registerVisit();
    await as(USERS.owner.id, "update public.services set price = 99, name = 'Corte caro' where id = $1", [cut]);
    assert.deepEqual(await lines(visit.visit_id), [
      { service_name: "Corte clásico", unit_price: "20.00", quantity: 1, gross: "20.00", discount: "0.00", net: "20.00" },
    ]);
    const next = await registerVisit();
    assert.equal(next.total, "99.00");
  });

  test("un servicio archivado o ajeno no se registra", async () => {
    await as(USERS.owner.id, "update public.services set archived_at = now() where id = $1", [beard]);
    const unavailable = hasSqlState(SQLSTATE.serviceUnavailable);
    await assert.rejects(registerVisit({ items: [{ service_id: cut, quantity: 1 }, { service_id: beard, quantity: 1 }] }), unavailable);
    await assert.rejects(registerVisit({ items: [{ service_id: randomUUID(), quantity: 1 }] }), unavailable);
    assert.equal((await loyalty()).progress, 0);
  });

  test("valida las líneas de la visita", async () => {
    const invalidItems = [
      [],
      [{ service_id: cut, quantity: 0 }],
      [{ service_id: cut, quantity: 100 }],
      [{ service_id: cut, quantity: 1.5 }],
      [{ service_id: cut, quantity: "1" }],
      [{ service_id: "no-es-uuid", quantity: 1 }],
      [{ service_id: cut, quantity: 1 }, { service_id: cut, quantity: 2 }],
    ];
    for (const items of invalidItems) {
      await assert.rejects(registerVisit({ items: items as VisitOptions["items"] }), invalid, JSON.stringify(items));
    }
  });

  test("un cliente archivado no recibe visitas", async () => {
    await as(USERS.owner.id, "update public.customers set archived_at = now() where id = $1", [customer]);
    await assert.rejects(registerVisit(), hasSqlState(SQLSTATE.customerArchived));
  });

  test("get_customer_loyalty informa el progreso, el aviso y la última visita", async () => {
    let info = await loyalty();
    assert.equal(info.configured, true);
    assert.equal(info.progress, 0);
    assert.equal(info.next_visit_completes, false);
    assert.equal(info.last_visit, null);

    await visits(4);
    info = await loyalty();
    assert.equal(info.progress, 4);
    assert.equal(info.next_visit_completes, true);
    assert.equal(info.reward?.service_name, "Corte clásico");
    assert.equal(info.last_visit?.customer_seq, 4);
    assert.equal(info.last_visit?.total, "20.00");
  });
});

describe("ganar y aplicar el premio", () => {
  test("en la visita N con «aplicado» queda canjeado en esa visita y el ciclo nuevo arranca en 0", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
    await visits(4);
    const fifth = await registerVisit({ apply: true, items: [{ service_id: cut, quantity: 1 }, { service_id: beard, quantity: 1 }] });

    assert.ok(fifth.issued_reward_id);
    assert.equal(fifth.redeemed_reward_id, fifth.issued_reward_id);
    assert.equal(fifth.issued_reward_status, "redeemed");
    assert.equal(fifth.progress, 0);
    assert.equal(fifth.visits_required, 5);
    assert.equal(fifth.discount_total, "20.00");
    assert.equal(fifth.total, "15.50");
    assert.deepEqual(await rewardStatus(fifth.issued_reward_id), {
      status: "redeemed",
      redeemed_visit_id: fifth.visit_id,
      discount_applied: "20.00",
    });

    const info = await loyalty();
    assert.equal(info.progress, 0);
    assert.equal(info.available_rewards.length, 0);
    assert.equal((await registerVisit()).progress, 1);

    // now() es igual para todos los eventos de la transacción; un UUID
    // aleatorio no representa el orden de inserción. Verificar los efectos
    // y su vínculo con la visita/premio, sin asumir ese orden.
    const rows = (await db.query<{ type: string; visit_id: string; reward_id: string | null }>(
      "select type::text, visit_id, reward_id from public.loyalty_events",
    )).rows;
    const events = rows.map((e) => e.type);
    assert.deepEqual(events.filter((t) => t !== "progress").sort(), ["reward_issued", "reward_redeemed"]);
    for (const event of rows.filter((e) => e.type !== "progress")) {
      assert.equal(event.visit_id, fifth.visit_id);
      assert.equal(event.reward_id, fifth.issued_reward_id);
    }
    assert.equal(events.filter((t) => t === "progress").length, 6);
  });

  test("con «después» queda pendiente y se aplica en una visita posterior", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
    const results = await visits(5);
    const rewardId = results[4].issued_reward_id;
    assert.ok(rewardId);
    assert.equal(results[4].issued_reward_status, "available");
    assert.equal(results[4].total, "20.00");
    assert.deepEqual((await loyalty()).available_rewards.map((r) => r.id), [rewardId]);

    const later = await registerVisit({ pendingRewardId: rewardId });
    assert.equal(later.redeemed_reward_id, rewardId);
    assert.equal(later.total, "0.00");
    assert.equal(later.progress, 1); // La visita del canje también suma.
    assert.equal((await rewardStatus(rewardId)).status, "redeemed");
    assert.equal((await loyalty()).available_rewards.length, 0);
  });

  test("aplicar el premio ganado fuera de la visita N da conflicto", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
    await visits(3);
    await assert.rejects(registerVisit({ apply: true }), hasSqlState(SQLSTATE.rewardNotEarned));
    assert.equal((await loyalty()).progress, 3);
  });

  test("meta de 1: cada visita gana el premio", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "10", visitsRequired: 1 });
    const first = await registerVisit({ apply: true });
    assert.equal(first.discount_total, "2.00");
    assert.equal(first.progress, 0);
    const second = await registerVisit();
    assert.equal(second.issued_reward_status, "available");
  });

  test("meta de 10", async () => {
    await saveProgram({ rewardType: "fixed_discount", amount: "5", visitsRequired: 10 });
    const results = await visits(9);
    assert.equal(results.every((r) => r.issued_reward_id === null), true);
    assert.equal((await loyalty()).next_visit_completes, true);
    const tenth = await registerVisit({ apply: true });
    assert.equal(tenth.total, "15.00");
  });

  test("porcentaje: redondeo a 2 decimales y reparto entre líneas", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "15", visitsRequired: 1 });
    // 15 % de 35.50 = 5.325 → 5.33; 20.00 recibe 3.00 y la última línea el ajuste.
    const visit = await registerVisit({ apply: true, items: [{ service_id: cut, quantity: 1 }, { service_id: beard, quantity: 1 }] });
    assert.equal(visit.discount_total, "5.33");
    assert.equal(visit.total, "30.17");
    const result = await lines(visit.visit_id);
    assert.deepEqual(result.map((l) => [l.discount, l.net]), [["3.00", "17.00"], ["2.33", "13.17"]]);
  });

  test("porcentaje con líneas de precio 0 y 100 %", async () => {
    await saveProgram({ rewardType: "percent_discount", percent: "100", visitsRequired: 1 });
    const visit = await registerVisit({
      apply: true,
      items: [{ service_id: wash, quantity: 1 }, { service_id: beard, quantity: 3 }, { service_id: cut, quantity: 1 }],
    });
    assert.equal(visit.total, "0.00");
    assert.deepEqual((await lines(visit.visit_id)).map((l) => l.net), ["0.00", "0.00", "0.00"]);
  });

  test("monto fijo mayor al subtotal deja el total en 0", async () => {
    await saveProgram({ rewardType: "fixed_discount", amount: "50", visitsRequired: 1 });
    const visit = await registerVisit({ apply: true, items: [{ service_id: beard, quantity: 1 }, { service_id: cut, quantity: 1 }] });
    assert.equal(visit.discount_total, "35.50");
    assert.equal(visit.total, "0.00");
    const [{ discount_applied }] = [await rewardStatus(visit.redeemed_reward_id ?? "")];
    assert.equal(discount_applied, "35.50");
  });

  test("monto fijo menor al subtotal se reparte y suma exacto", async () => {
    await saveProgram({ rewardType: "fixed_discount", amount: "10", visitsRequired: 1 });
    const visit = await registerVisit({
      apply: true,
      items: [{ service_id: cut, quantity: 1 }, { service_id: beard, quantity: 1 }, { service_id: wash, quantity: 1 }],
    });
    assert.equal(visit.total, "25.50");
    const result = await lines(visit.visit_id);
    // 10 × 20/35.50 = 5.63; el resto (4.37) va a Barba; Lavado vale 0.
    assert.deepEqual(result.map((l) => l.discount), ["5.63", "4.37", "0.00"]);
  });

  test("custom_benefit tiene descuento 0 y queda constancia del canje", async () => {
    await saveProgram({ rewardType: "custom_benefit", description: "Lavado + mascarilla gratis", visitsRequired: 1 });
    const visit = await registerVisit({ apply: true });
    assert.equal(visit.discount_total, "0.00");
    assert.equal(visit.total, "20.00");
    assert.equal((await rewardStatus(visit.redeemed_reward_id ?? "")).status, "redeemed");
  });

  test("free_service descuenta una unidad aunque la cantidad sea mayor", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut, visitsRequired: 1 });
    const visit = await registerVisit({ apply: true, items: [{ service_id: beard, quantity: 1 }, { service_id: cut, quantity: 2 }] });
    assert.equal(visit.total, "35.50");
    assert.deepEqual((await lines(visit.visit_id)).map((l) => l.discount), ["0.00", "20.00"]);
  });

  test("free_service sin ese servicio en la visita se rechaza y no se pierde nada", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut, visitsRequired: 1 });
    await assert.rejects(registerVisit({ apply: true, items: [{ service_id: beard, quantity: 1 }] }), hasSqlState(SQLSTATE.rewardServiceMissing));
    assert.equal((await db.query("select 1 from public.visits")).rows.length, 0);
    assert.equal((await db.query("select 1 from public.rewards")).rows.length, 0);
  });

  test("un premio por visita y nunca dos veces el mismo", async () => {
    await saveProgram({ rewardType: "custom_benefit", description: "Café", visitsRequired: 1 });
    const first = await registerVisit();
    const pending = first.issued_reward_id ?? "";

    // Ganado + pendiente en la misma visita: no.
    await assert.rejects(registerVisit({ apply: true, pendingRewardId: pending }), invalid);

    // Pendiente aplicado; la visita gana otro que queda pendiente.
    const second = await registerVisit({ pendingRewardId: pending });
    assert.equal(second.redeemed_reward_id, pending);
    assert.equal(second.issued_reward_status, "available");

    // El mismo premio otra vez: no.
    await assert.rejects(registerVisit({ pendingRewardId: pending }), hasSqlState(SQLSTATE.rewardNotAvailable));
    // Un premio de otro cliente: no.
    const other = await addCustomer("11112222");
    await assert.rejects(registerVisit({ customerId: other, pendingRewardId: second.issued_reward_id }), hasSqlState(SQLSTATE.rewardNotAvailable));
  });

  test("una promoción pausada no suma pero permite aplicar premios pendientes", async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut, visitsRequired: 2 });
    const [, earned] = await visits(2);
    await registerVisit();
    await saveProgram({ rewardType: "free_service", serviceId: cut, visitsRequired: 2, status: "paused" });

    const paused = await registerVisit();
    assert.equal(paused.counted, false);
    assert.equal(paused.progress, 1);
    const info = await loyalty();
    assert.equal(info.program_status, "paused");
    assert.equal(info.next_visit_completes, false);
    await assert.rejects(registerVisit({ apply: true }), hasSqlState(SQLSTATE.rewardNotEarned));

    const redeemed = await registerVisit({ pendingRewardId: earned.issued_reward_id });
    assert.equal(redeemed.total, "0.00");
    assert.equal(redeemed.counted, false);
  });
});

describe("idempotencia y concurrencia", () => {
  beforeEach(async () => {
    await saveProgram({ rewardType: "free_service", serviceId: cut });
  });

  test("la misma clave con los mismos datos devuelve la misma visita", async () => {
    const key = randomUUID();
    const first = await registerVisit({ key });
    const retry = await registerVisit({ key });
    assert.equal(retry.visit_id, first.visit_id);
    assert.equal(retry.replayed, true);
    assert.equal(first.replayed, false);
    assert.equal((await loyalty()).progress, 1);
    assert.equal((await db.query("select 1 from public.visits")).rows.length, 1);
  });

  test("la misma clave con datos distintos da conflicto", async () => {
    const key = randomUUID();
    await registerVisit({ key });
    const conflict = hasSqlState(SQLSTATE.idempotencyConflict);
    await assert.rejects(registerVisit({ key, items: [{ service_id: cut, quantity: 2 }] }), conflict);
    await assert.rejects(registerVisit({ key, attendedBy: USERS.owner.id }), conflict);
    await assert.rejects(registerVisit({ key, customerId: await addCustomer("33334444") }), conflict);
  });

  test("la misma clave en otro negocio no se confunde", async () => {
    const key = randomUUID();
    await registerVisit({ key });
    await saveProgram({ rewardType: "custom_benefit", description: "Sur" }, USERS.ownerB.id, orgB);
    const cutB = await addService("Corte Sur", "10.00", orgB, USERS.ownerB.id);
    const customerB = await addCustomer("00123456", orgB, USERS.ownerB.id);
    const visitB = await registerVisit({ key, barbershopId: shopB, customerId: customerB, items: [{ service_id: cutB, quantity: 1 }] }, USERS.ownerB.id);
    assert.equal(visitB.replayed, false);
  });

  test("dos registros del mismo cliente cerca de la meta no emiten dos premios ni pierden progreso", async () => {
    // PGlite usa una sola conexión: no ejecuta transacciones en paralelo. Se
    // prueba el orden que imponen los bloqueos: ambas pantallas ven «visita 5
    // de 5»; la primera gana el premio y la segunda, que pide aplicarlo, recibe
    // un conflicto y no cambia nada. Reintentada sin aplicar, suma al ciclo nuevo.
    await visits(4);
    assert.equal((await loyalty()).next_visit_completes, true);

    const first = await registerVisit({ apply: true });
    assert.ok(first.issued_reward_id);
    await assert.rejects(registerVisit({ apply: true }), hasSqlState(SQLSTATE.rewardNotEarned));

    const retried = await registerVisit();
    assert.equal(retried.progress, 1);
    assert.equal(retried.issued_reward_id, null);

    const { rows } = await db.query<{ rewards: number; open_cycles: number; visits: number }>(
      `select (select count(*)::int from public.rewards) as rewards,
              (select count(*)::int from public.loyalty_cycles where status = 'open') as open_cycles,
              (select count(*)::int from public.visits) as visits`,
    );
    assert.deepEqual(rows[0], { rewards: 1, open_cycles: 1, visits: 6 });
  });

  test("las restricciones impiden dos ciclos abiertos o dos premios por ciclo", async () => {
    await visits(5);
    const [cycle] = (await db.query<{ id: string; program_id: string }>("select id, program_id from public.loyalty_cycles where status = 'completed'")).rows;
    await assert.rejects(
      db.query(
        `insert into public.loyalty_cycles (organization_id, customer_id, program_id, visits_required, reward_type, reward_service_id, reward_service_name)
         values ($1, $2, $3, 5, 'free_service', $4, 'Corte')`,
        [orgA, customer, cycle.program_id, cut],
      ),
      hasSqlState(SQLSTATE.uniqueViolation),
    );
    const [visit] = (await db.query<{ id: string }>("select id from public.visits limit 1")).rows;
    await assert.rejects(
      db.query(
        `insert into public.rewards (organization_id, customer_id, cycle_id, issued_visit_id, reward_type, reward_service_id, reward_service_name)
         values ($1, $2, $3, $4, 'free_service', $5, 'Corte')`,
        [orgA, customer, cycle.id, visit.id, cut],
      ),
      hasSqlState(SQLSTATE.uniqueViolation),
    );
  });
});

describe("página pública", () => {
  test("muestra el texto del premio solo si la promoción está activa", async () => {
    await as(USERS.owner.id, "update public.barbershops set is_published = true where id = $1", [shopA]);
    const publicText = async () =>
      (await as<{ data: { loyalty_text: string | null } }>(null, "select public.get_public_barbershop('norte') as data"))[0].data.loyalty_text;

    assert.equal(await publicText(), null);
    await saveProgram({ rewardType: "free_service", serviceId: cut, publicText: "Cada 5 visitas, tu corte es gratis" });
    assert.equal(await publicText(), "Cada 5 visitas, tu corte es gratis");
    await saveProgram({ rewardType: "free_service", serviceId: cut, publicText: "Cada 5 visitas, tu corte es gratis", status: "paused" });
    assert.equal(await publicText(), null);

    // Sigue sin exponer visitas ni clientes.
    await saveProgram({ rewardType: "free_service", serviceId: cut, publicText: "Hola" });
    await registerVisit();
    const [{ data }] = await as<{ data: Record<string, unknown> }>(null, "select public.get_public_barbershop('norte') as data");
    const json = JSON.stringify(data);
    assert.equal(json.includes("00123456"), false);
    assert.equal(json.includes(customer), false);
  });
});

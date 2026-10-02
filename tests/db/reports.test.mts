import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000a1", email: "duena@norte.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000a2", email: "barbero@norte.pe" },
  formerWorker: { id: "00000000-0000-4000-8000-0000000000a3", email: "antiguo@norte.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000a4", email: "dueno@sur.pe" },
  outsider: { id: "00000000-0000-4000-8000-0000000000a5", email: "nadie@correo.pe" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const invalid = hasSqlState(SQLSTATE.invalidParameterValue);

type Amounts = { visits: number; service_units: number; subtotal: string; discount_total: string; total: string };
type MemberRow = Amounts & { user_id: string; email: string; role: string; is_active: boolean };
type Report = { from: string; to: string; totals: Amounts; members: MemberRow[] };
type DetailRow = {
  visit_id: string;
  visited_at: string;
  customer_name: string;
  attended_by: string;
  attended_by_email: string;
  service_units: number;
  subtotal: string;
  discount_total: string;
  total: string;
  corrected_at: string | null;
  items: Array<{ service_name: string; unit_price: string; quantity: number; gross: string; discount: string; net: string }>;
  total_count: number;
};

let db: PGlite;
let orgA: string;
let orgB: string;
let shopA: string;
let shopB: string;
let cut: string; // 20.00
let beard: string; // 15.50
let customer: string;
let customer2: string;

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function addService(name: string, price: string, organizationId = orgA, userId: string = USERS.owner.id) {
  const [row] = await as<{ id: string }>(userId,
    "insert into public.services (organization_id, name, price) values ($1, $2, $3) returning id", [organizationId, name, price]);
  return row.id;
}

async function addCustomer(dni: string, organizationId = orgA, userId: string = USERS.owner.id) {
  const [row] = await as<{ id: string }>(userId,
    `insert into public.customers (organization_id, full_name, dni, phone, consent_by)
     values ($1, 'Cliente ' || $2, $2, '987654321', $3) returning id`, [organizationId, dni, userId]);
  return row.id;
}

async function register(options: {
  items: Array<{ service_id: string; quantity: number }>;
  user?: string; attendedBy?: string | null; apply?: boolean; customerId?: string; shop?: string;
}) {
  const [row] = await as<{ visit_id: string }>(options.user ?? USERS.worker.id,
    "select visit_id from public.register_visit($1, $2, $3::jsonb, $4, $5, null, $6)",
    [options.shop ?? shopA, options.customerId ?? customer, JSON.stringify(options.items), options.attendedBy ?? null, options.apply ?? false, randomUUID()]);
  return row.visit_id;
}

async function setVisitedAt(visitId: string, instant: string) {
  await db.query("update public.visits set visited_at = $2 where id = $1", [visitId, instant]);
}

async function report(from: string, to: string, attendedBy: string | null = null, user: string | null = USERS.owner.id, org = orgA) {
  const [row] = await as<{ data: Report }>(user, "select public.get_business_report($1, $2, $3, $4) as data", [org, from, to, attendedBy]);
  return row.data;
}

async function detail(from: string, to: string, options: { attendedBy?: string | null; limit?: number; offset?: number; user?: string | null; org?: string } = {}) {
  return as<DetailRow>(options.user === undefined ? USERS.owner.id : options.user,
    "select * from public.list_report_visits($1, $2, $3, $4, $5, $6)",
    [options.org ?? orgA, from, to, options.attendedBy ?? null, options.limit ?? 20, options.offset ?? 0]);
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  [{ id: orgA }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte', 'Calle 1', 'norte', '2026-10-01') as id");
  [{ id: orgB }] = await as<{ id: string }>(USERS.ownerB.id, "select public.create_business('Sur', 'Calle 2', 'sur', '2026-10-01') as id");
  for (const user of [USERS.worker, USERS.formerWorker]) {
    await as(USERS.owner.id, "select * from public.add_worker_by_email($1, $2)", [orgA, user.email]);
  }
  [{ id: shopA }] = (await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [orgA])).rows;
  [{ id: shopB }] = (await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [orgB])).rows;
  cut = await addService("Corte clásico", "20.00");
  beard = await addService("Barba", "15.50");
  customer = await addCustomer("00123456");
  customer2 = await addCustomer("00654321");
  // Cada 2 visitas, S/ 5 de descuento.
  await as(USERS.owner.id, "select public.save_loyalty_program(p_organization_id => $1, p_reward_type => 'fixed_discount', p_visits_required => 2, p_reward_amount => 5)", [orgA]);
});

// Día de referencia en Lima: 2026-10-01 (UTC-5, sin horario de verano).
const DAY = "2026-10-01";
const NOON = "2026-10-01T12:00:00-05:00";

// Escenario común: varias líneas, cantidades > 1, descuento, corrección que
// cambia quién atendió, trabajador desactivado y una visita anulada.
async function seedScenario() {
  // Registrada a nombre del dueño y corregida después: 3 cortes + 1 barba, atendió el trabajador.
  const corrected = await register({ items: [{ service_id: cut, quantity: 2 }, { service_id: beard, quantity: 1 }], attendedBy: USERS.owner.id });
  // Completa el ciclo y aplica S/ 5: 20.00 - 5.00.
  const discounted = await register({ items: [{ service_id: cut, quantity: 1 }], user: USERS.owner.id, apply: true });
  // Trabajador que luego se desactiva: 3 barbas = 46.50.
  const former = await register({ items: [{ service_id: beard, quantity: 3 }], user: USERS.formerWorker.id, customerId: customer2 });
  // Anulada: no debe contar.
  const voided = await register({ items: [{ service_id: cut, quantity: 5 }], customerId: customer2 });
  await as(USERS.worker.id, "select public.void_last_visit($1, 'Duplicada', $2)", [customer2, voided]);
  await as(USERS.owner.id, "select public.correct_visit($1, $2::jsonb, $3, 'Faltó un corte')",
    [corrected, JSON.stringify([{ service_id: cut, quantity: 3 }, { service_id: beard, quantity: 1 }]), USERS.worker.id]);
  await as(USERS.owner.id, "select public.set_worker_active($1, $2, false)", [orgA, USERS.formerWorker.id]);
  for (const id of [corrected, discounted, former, voided]) await setVisitedAt(id, NOON);
  return { corrected, discounted, former, voided };
}

describe("cálculo del reporte", () => {
  test("suma visitas, unidades e importes sin duplicar al unir líneas", async () => {
    await seedScenario();
    const data = await report(DAY, DAY);
    assert.equal(data.from, DAY);
    assert.equal(data.to, DAY);
    // 75.50 (corregida) + 20.00 (con descuento) + 46.50 = 142.00; descuento 5.00.
    assert.deepEqual(data.totals, { visits: 3, service_units: 8, subtotal: "142.00", discount_total: "5.00", total: "137.00" });

    const byUser = new Map(data.members.map(m => [m.user_id, m]));
    assert.equal(data.members.length, 3);
    assert.deepEqual(
      { ...byUser.get(USERS.worker.id) },
      { user_id: USERS.worker.id, email: USERS.worker.email, role: "barber", is_active: true, visits: 1, service_units: 4, subtotal: "75.50", discount_total: "0.00", total: "75.50" },
    );
    assert.deepEqual(
      { ...byUser.get(USERS.owner.id) },
      { user_id: USERS.owner.id, email: USERS.owner.email, role: "owner", is_active: true, visits: 1, service_units: 1, subtotal: "20.00", discount_total: "5.00", total: "15.00" },
    );
    const former = byUser.get(USERS.formerWorker.id);
    assert.equal(former?.is_active, false);
    assert.equal(former?.total, "46.50");
    assert.equal(former?.service_units, 3);
    // Ordenado por total de servicios registrados.
    assert.deepEqual(data.members.map(m => m.user_id), [USERS.worker.id, USERS.formerWorker.id, USERS.owner.id]);
  });

  test("filtra por trabajador, incluido uno desactivado", async () => {
    await seedScenario();
    const data = await report(DAY, DAY, USERS.formerWorker.id);
    assert.deepEqual(data.totals, { visits: 1, service_units: 3, subtotal: "46.50", discount_total: "0.00", total: "46.50" });
    assert.deepEqual(data.members.map(m => m.user_id), [USERS.formerWorker.id]);
    const rows = await detail(DAY, DAY, { attendedBy: USERS.formerWorker.id });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].attended_by_email, USERS.formerWorker.email);
  });

  test("sin visitas devuelve ceros y lista vacía", async () => {
    const data = await report(DAY, DAY);
    assert.deepEqual(data.totals, { visits: 0, service_units: 0, subtotal: "0.00", discount_total: "0.00", total: "0.00" });
    assert.deepEqual(data.members, []);
    assert.deepEqual(await detail(DAY, DAY), []);
  });

  test("el detalle muestra cada visita una vez con sus líneas históricas y pagina", async () => {
    const { corrected, voided } = await seedScenario();
    await as(USERS.owner.id, "update public.services set price = 99 where id = $1", [cut]);
    const rows = await detail(DAY, DAY);
    assert.equal(rows.length, 3);
    assert(rows.every(r => r.total_count === 3));
    assert(!rows.some(r => r.visit_id === voided));
    const row = rows.find(r => r.visit_id === corrected);
    assert(row);
    assert.equal(row.service_units, 4);
    assert.equal(row.subtotal, "75.50");
    assert(row.corrected_at);
    assert.equal(row.customer_name, "Cliente 00123456");
    assert.deepEqual(row.items.map(i => [i.service_name, i.unit_price, i.quantity, i.gross]),
      [["Corte clásico", "20.00", 3, "60.00"], ["Barba", "15.50", 1, "15.50"]]);
    const discounted = rows.find(r => r.discount_total === "5.00");
    assert.equal(discounted?.items[0].net, "15.00");
    // La suma del detalle coincide con el resumen.
    const sum = rows.reduce((acc, r) => acc + Math.round(Number(r.total) * 100), 0);
    assert.equal(sum, 13700);

    const page2 = await detail(DAY, DAY, { limit: 2, offset: 2 });
    assert.equal(page2.length, 1);
    assert.equal(page2[0].total_count, 3);
    const page1 = await detail(DAY, DAY, { limit: 2, offset: 0 });
    assert.equal(new Set([...page1, ...page2].map(r => r.visit_id)).size, 3);
  });

  test("usa los límites del día en America/Lima", async () => {
    const items = [{ service_id: cut, quantity: 1 }];
    const lastSecondBefore = await register({ items });
    const firstSecond = await register({ items, customerId: customer2 });
    const lastSecond = await register({ items, customerId: customer2 });
    const nextDay = await register({ items, customerId: customer2 });
    await setVisitedAt(lastSecondBefore, "2026-09-30T23:59:59-05:00"); // 04:59:59 UTC del 1 de octubre
    await setVisitedAt(firstSecond, "2026-10-01T00:00:00-05:00");
    await setVisitedAt(lastSecond, "2026-10-01T23:59:59.999-05:00");
    await setVisitedAt(nextDay, "2026-10-02T00:00:00-05:00");

    const ids = async (from: string, to: string) => (await detail(from, to)).map(r => r.visit_id).sort();
    assert.deepEqual(await ids(DAY, DAY), [firstSecond, lastSecond].sort());
    assert.equal((await report(DAY, DAY)).totals.visits, 2);
    assert.deepEqual(await ids("2026-09-30", "2026-09-30"), [lastSecondBefore]);
    assert.deepEqual(await ids("2026-10-02", "2026-10-02"), [nextDay]);
    assert.equal((await report("2026-09-28", "2026-10-04")).totals.visits, 4);
  });

  test("refleja anulaciones y correcciones posteriores sin tocar el registro", async () => {
    const first = await register({ items: [{ service_id: cut, quantity: 1 }] });
    await setVisitedAt(first, NOON);
    assert.equal((await report(DAY, DAY)).totals.total, "20.00");
    await as(USERS.worker.id, "select public.correct_visit($1, $2::jsonb, $3, 'Eran dos')",
      [first, JSON.stringify([{ service_id: cut, quantity: 2 }]), USERS.worker.id]);
    assert.equal((await report(DAY, DAY)).totals.total, "40.00");
    await as(USERS.worker.id, "select public.void_last_visit($1, 'Error', $2)", [customer, first]);
    assert.equal((await report(DAY, DAY)).totals.visits, 0);
  });
});

describe("seguridad del reporte", () => {
  test("trabajadores, anónimos, ajenos y desactivados no obtienen reportes", async () => {
    await seedScenario();
    for (const user of [USERS.worker.id, USERS.formerWorker.id, USERS.ownerB.id, USERS.outsider.id, null]) {
      await assert.rejects(report(DAY, DAY, null, user), denied, String(user));
      await assert.rejects(detail(DAY, DAY, { user }), denied, String(user));
    }
    // Los permisos se comprueban antes que los filtros.
    await assert.rejects(report("2026-10-02", DAY, null, USERS.worker.id), denied);
  });

  test("cada negocio ve solo sus datos, aunque sea del mismo dueño", async () => {
    await seedScenario();
    const serviceB = await addService("Corte sur", "30.00", orgB, USERS.ownerB.id);
    const customerB = await addCustomer("11111111", orgB, USERS.ownerB.id);
    await as(USERS.ownerB.id, "select public.save_loyalty_program(p_organization_id => $1, p_reward_type => 'custom_benefit', p_reward_description => 'Gel')", [orgB]);
    const visitB = await register({ items: [{ service_id: serviceB, quantity: 1 }], user: USERS.ownerB.id, customerId: customerB, shop: shopB });
    await setVisitedAt(visitB, NOON);

    assert.equal((await report(DAY, DAY)).totals.total, "137.00");
    const dataB = await report(DAY, DAY, null, USERS.ownerB.id, orgB);
    assert.deepEqual(dataB.totals, { visits: 1, service_units: 1, subtotal: "30.00", discount_total: "0.00", total: "30.00" });
    await assert.rejects(report(DAY, DAY, null, USERS.owner.id, orgB), denied);
    await assert.rejects(detail(DAY, DAY, { org: orgB }), denied);

    // Segundo negocio del mismo dueño: vacío y sin acceso a miembros del primero.
    const [{ id: orgA2 }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte 2', 'Calle 3', 'norte-2', '2026-10-01') as id");
    assert.equal((await report(DAY, DAY, null, USERS.owner.id, orgA2)).totals.visits, 0);
    await assert.rejects(report(DAY, DAY, USERS.worker.id, USERS.owner.id, orgA2), invalid);
    await assert.rejects(report(DAY, DAY, USERS.ownerB.id), invalid);
  });

  test("valida período y paginación", async () => {
    for (const [from, to] of [["2026-10-02", DAY], ["2025-01-01", "2026-01-02"], ["1999-12-31", "2000-01-01"], ["infinity", "infinity"]]) {
      await assert.rejects(report(from, to), invalid, `${from}..${to}`);
      await assert.rejects(detail(from, to), invalid, `${from}..${to}`);
    }
    await assert.rejects(as(USERS.owner.id, "select public.get_business_report($1, null, $2)", [orgA, DAY]), invalid);
    // 366 días incluidos (año bisiesto) sí se permiten.
    assert.equal((await report("2028-01-01", "2028-12-31")).totals.visits, 0);
    for (const [limit, offset] of [[0, 0], [51, 0], [20, -1], [20, 100001]]) {
      await assert.rejects(detail(DAY, DAY, { limit, offset }), invalid, `${limit}/${offset}`);
    }
  });

  test("las funciones no se conceden a anon y son security definer con search_path vacío", async () => {
    const { rows } = await db.query<{ proname: string; anon: boolean; auth: boolean; definer: boolean; config: string[] }>(
      `select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth, p.prosecdef as definer, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('get_business_report', 'list_report_visits') order by p.proname`);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.anon, false);
      assert.equal(row.auth, true);
      assert.equal(row.definer, true);
      assert(row.config.includes('search_path=""'));
    }
    const [helper] = (await db.query<{ auth: boolean }>(
      "select has_function_privilege('authenticated', 'private.report_range(uuid,date,date,uuid)', 'EXECUTE') as auth")).rows;
    assert.equal(helper.auth, false);
  });
});

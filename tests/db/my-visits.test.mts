import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

// Etapa 13: «Mis visitas» solo con agregados y vinculación por correo verificado.

const SINCE = "2026-10-01T00:00:00Z";

const USERS = {
  owner: { id: "00000000-0000-4000-8000-000000000e01", email: "duena@norte.pe" },
  ownerB: { id: "00000000-0000-4000-8000-000000000e02", email: "dueno@sur.pe" },
  client: { id: "00000000-0000-4000-8000-000000000e03", email: "Cliente@Correo.pe", confirmed: "2026-10-02T00:00:00Z" },
  unverified: { id: "00000000-0000-4000-8000-000000000e04", email: "nuevo@correo.pe", confirmed: null },
  autoconfirmed: { id: "00000000-0000-4000-8000-000000000e05", email: "antiguo@correo.pe", confirmed: "2026-09-01T00:00:00Z" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const invalid = hasSqlState(SQLSTATE.invalidParameterValue);
const checkViolation = hasSqlState(SQLSTATE.checkViolation);

type Item = {
  barbershop_name: string;
  slug: string | null;
  district: string | null;
  total_visits: number;
  progress: number | null;
  visits_required: number | null;
  visits_remaining: number | null;
  program_status: string | null;
  available_rewards: number;
};
type MyVisits = { status: string; items: Item[] };

let db: PGlite;
let orgA: string;
let orgB: string;
let shopA: string;
let serviceA: string;

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function enableLinking(): Promise<void> {
  await db.exec(`create or replace function private.verified_email_since() returns timestamptz
    language sql stable set search_path = '' as $$ select '${SINCE}'::timestamptz $$;`);
}

async function myVisits(userId: string): Promise<MyVisits> {
  const [row] = await as<{ data: MyVisits }>(userId, "select public.get_my_visits() as data");
  return row.data;
}

async function addCustomer(organizationId: string, ownerId: string, dni: string, email: string | null): Promise<string> {
  const [row] = await as<{ id: string }>(
    ownerId,
    `insert into public.customers (organization_id, full_name, dni, phone, consent_by, email)
     values ($1, 'Cliente', $2, '987654321', $3, $4) returning id`,
    [organizationId, dni, ownerId, email],
  );
  return row.id;
}

async function registerVisit(ownerId: string, shopId: string, customerId: string, serviceId: string, apply = false): Promise<void> {
  await as(ownerId, "select * from public.register_visit($1, $2, $3::jsonb, null, $4, null, $5)", [
    shopId,
    customerId,
    JSON.stringify([{ service_id: serviceId, quantity: 1 }]),
    apply,
    randomUUID(),
  ]);
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    const confirmed = "confirmed" in user ? user.confirmed : SINCE;
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)", [user.id, user.email, confirmed]);
  }
  [{ id: orgA }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte', 'Calle 1', 'norte', '2026-10-01') as id");
  [{ id: orgB }] = await as<{ id: string }>(USERS.ownerB.id, "select public.create_business('Sur', 'Calle 2', 'sur', '2026-10-01') as id");
  shopA = (await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [orgA])).rows[0].id;
  [{ id: serviceA }] = await as<{ id: string }>(USERS.owner.id, "insert into public.services (organization_id, name, price) values ($1, 'Corte', 20) returning id", [orgA]);
  await as(USERS.owner.id, "select public.save_loyalty_program($1, 'custom_benefit', 3, null, null, null, 'Lavado gratis')", [orgA]);
});

describe("customers.email", () => {
  test("es opcional, se normaliza y se valida", async () => {
    const id = await addCustomer(orgA, USERS.owner.id, "00000001", "  Cliente@Correo.PE ");
    const empty = await addCustomer(orgA, USERS.owner.id, "00000002", "   ");
    const { rows } = await db.query<{ email: string | null }>("select email from public.customers where id = any($1) order by dni", [[id, empty]]);
    assert.deepEqual(rows.map((r) => r.email), ["cliente@correo.pe", null]);
    await assert.rejects(addCustomer(orgA, USERS.owner.id, "00000003", "sin-arroba"), checkViolation);
  });

  test("lo edita solo el dueño, como los demás datos del cliente", async () => {
    await as(USERS.owner.id, "select public.add_worker_by_email($1, $2)", [orgA, USERS.ownerB.email]);
    const id = await addCustomer(orgA, USERS.ownerB.id, "00000004", "a@b.pe");
    const updated = await as(USERS.ownerB.id, "update public.customers set email = 'x@y.pe' where id = $1 returning id", [id]);
    assert.equal(updated.length, 0);
    assert.equal((await as(USERS.owner.id, "update public.customers set email = 'x@y.pe' where id = $1 returning id", [id])).length, 1);
  });
});

describe("get_my_visits", () => {
  test("desactivado hasta que se active la verificación de correo", async () => {
    await addCustomer(orgA, USERS.owner.id, "00000001", USERS.client.email);
    assert.deepEqual(await myVisits(USERS.client.id), { status: "disabled", items: [] });
  });

  test("solo con correo verificado después de la activación", async () => {
    await enableLinking();
    await addCustomer(orgA, USERS.owner.id, "00000001", USERS.unverified.email);
    await addCustomer(orgA, USERS.owner.id, "00000002", USERS.autoconfirmed.email);
    assert.deepEqual(await myVisits(USERS.unverified.id), { status: "unverified", items: [] });
    assert.deepEqual(await myVisits(USERS.autoconfirmed.id), { status: "unverified", items: [] });
  });

  test("devuelve solo agregados por barbería, vinculados por correo sin distinguir mayúsculas", async () => {
    await enableLinking();
    const inA = await addCustomer(orgA, USERS.owner.id, "00000001", "cliente@correo.pe");
    const inB = await addCustomer(orgB, USERS.ownerB.id, "00000001", "CLIENTE@correo.pe");
    // Otro cliente con otro correo no aparece.
    await addCustomer(orgA, USERS.owner.id, "00000009", "otra@correo.pe");

    // Norte: meta 3, 4 visitas → 1 premio pendiente y 1 de 3 en el ciclo nuevo.
    for (let i = 0; i < 2; i += 1) await registerVisit(USERS.owner.id, shopA, inA, serviceA);
    await registerVisit(USERS.owner.id, shopA, inA, serviceA, false);
    await registerVisit(USERS.owner.id, shopA, inA, serviceA);
    await as(USERS.owner.id, "update public.barbershops set is_published = true, district = 'Miraflores' where id = $1", [shopA]);

    const result = await myVisits(USERS.client.id);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.items, [
      {
        barbershop_name: "Norte",
        slug: "norte",
        district: "Miraflores",
        total_visits: 4,
        progress: 1,
        visits_required: 3,
        visits_remaining: 2,
        program_status: "active",
        available_rewards: 1,
      },
      // Sur no configuró premio: sin meta ni faltantes, y sin slug porque no está publicado.
      {
        barbershop_name: "Sur",
        slug: null,
        district: null,
        total_visits: 0,
        progress: null,
        visits_required: null,
        visits_remaining: null,
        program_status: null,
        available_rewards: 0,
      },
    ]);
    // Nunca expone DNI, celular, nombre registrado ni identificadores internos.
    const serialized = JSON.stringify(result);
    for (const secret of ["00000001", "987654321", "Cliente", inA, inB, orgA, orgB]) {
      assert.equal(serialized.includes(secret), false, secret);
    }
  });

  test("las visitas anuladas no cuentan y los clientes archivados no aparecen", async () => {
    await enableLinking();
    const inA = await addCustomer(orgA, USERS.owner.id, "00000001", "cliente@correo.pe");
    await registerVisit(USERS.owner.id, shopA, inA, serviceA);
    const [{ id: visitId }] = await as<{ id: string }>(USERS.owner.id, "select id from public.visits where customer_id = $1", [inA]);
    await as(USERS.owner.id, "select public.void_last_visit($1, 'Duplicada', $2)", [inA, visitId]);
    const [item] = (await myVisits(USERS.client.id)).items;
    assert.equal(item.total_visits, 0);
    assert.equal(item.visits_remaining, 3);

    await as(USERS.owner.id, "update public.customers set archived_at = now() where id = $1", [inA]);
    assert.deepEqual((await myVisits(USERS.client.id)).items, []);
  });

  test("el cliente con cuenta no lee customers ni visits de las barberías", async () => {
    await enableLinking();
    const inA = await addCustomer(orgA, USERS.owner.id, "00000001", "cliente@correo.pe");
    await registerVisit(USERS.owner.id, shopA, inA, serviceA);
    for (const table of ["customers", "visits", "visit_items", "rewards", "loyalty_cycles"]) {
      assert.equal((await as(USERS.client.id, `select * from public.${table}`)).length, 0, table);
    }
    await assert.rejects(as(USERS.client.id, "select public.get_customer_loyalty($1)", [inA]), denied);
  });

  test("anónimos no ejecutan las funciones", async () => {
    await assert.rejects(as(null, "select public.get_my_visits()"), denied);
    await assert.rejects(as(null, "select public.save_my_profile('987654321')"), denied);
  });
});

describe("celular del perfil", () => {
  async function phone(userId: string): Promise<string | null> {
    const [row] = await as<{ phone: string | null }>(userId, "select phone from public.profiles");
    return row?.phone ?? null;
  }

  test("se normaliza a +51, se puede borrar y se rechaza si no es celular", async () => {
    await as(USERS.client.id, "select public.save_my_profile('987 654 321')");
    assert.equal(await phone(USERS.client.id), "+51987654321");
    await as(USERS.client.id, "select public.save_my_profile('+51 912-345-678')");
    assert.equal(await phone(USERS.client.id), "+51912345678");
    await as(USERS.client.id, "select public.save_my_profile('')");
    assert.equal(await phone(USERS.client.id), null);
    for (const value of ["12345", "014567890", "+1 987654321"]) {
      await assert.rejects(as(USERS.client.id, "select public.save_my_profile($1)", [value]), invalid, value);
    }
  });

  test("conserva los términos aceptados y nadie lo escribe directamente", async () => {
    await as(USERS.client.id, "select public.accept_terms('2026-10-01')");
    await as(USERS.client.id, "select public.save_my_profile('987654321')");
    const [row] = await as<{ terms_version: string }>(USERS.client.id, "select terms_version from public.profiles");
    assert.equal(row.terms_version, "2026-10-01");
    await assert.rejects(as(USERS.client.id, "update public.profiles set phone = '+51900000000'"), denied);
    // Cada uno ve solo su perfil.
    await as(USERS.owner.id, "select public.save_my_profile('900000000')");
    assert.equal((await as(USERS.client.id, "select * from public.profiles")).length, 1);
  });
});

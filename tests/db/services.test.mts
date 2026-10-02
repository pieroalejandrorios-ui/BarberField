import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000c1", email: "duena@norte.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000c2", email: "barbero@norte.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000c3", email: "dueno@sur.pe" },
  outsider: { id: "00000000-0000-4000-8000-0000000000c4", email: "nadie@correo.pe" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const checkViolation = hasSqlState(SQLSTATE.checkViolation);
const invalidInput = hasSqlState(SQLSTATE.invalidParameterValue);

const INSERT_SERVICE =
  "insert into public.services (organization_id, name, price, duration_minutes, sort_order) values ($1, $2, $3, $4, $5) returning id";

let db: PGlite;
let orgA: string;
let orgB: string;

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function createService(
  userId: string,
  organizationId: string,
  name: string,
  price: string,
  sortOrder = 0,
): Promise<string> {
  const rows = await as<{ id: string }>(userId, INSERT_SERVICE, [organizationId, name, price, 30, sortOrder]);
  return rows[0].id;
}

async function serviceNames(userId: string | null, organizationId: string): Promise<string[]> {
  const rows = await as<{ name: string }>(
    userId,
    "select name from public.services where organization_id = $1 order by sort_order, name",
    [organizationId],
  );
  return rows.map((row) => row.name);
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  [orgA] = (await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte', 'Calle 1', 'norte', '2026-10-01') as id")).map((r) => r.id);
  [orgB] = (await as<{ id: string }>(USERS.ownerB.id, "select public.create_business('Sur', 'Calle 2', 'sur', '2026-10-01') as id")).map((r) => r.id);
  await as(USERS.owner.id, "select * from public.add_worker_by_email($1, $2)", [orgA, USERS.worker.email]);
});

describe("servicios", () => {
  test("el dueño crea un servicio con precio exacto y queda disponible en el local", async () => {
    const id = await createService(USERS.owner.id, orgA, "Corte clásico", "25.50");

    const [service] = await as<{ price: string; is_published: boolean }>(
      USERS.owner.id,
      "select price::text as price, is_published from public.services where id = $1",
      [id],
    );
    assert.deepEqual(service, { price: "25.50", is_published: true });

    const locations = await as<{ is_available: boolean }>(
      USERS.worker.id,
      "select is_available from public.service_locations where service_id = $1",
      [id],
    );
    assert.deepEqual(locations, [{ is_available: true }]);
  });

  test("se rechazan precio negativo, nombre vacío o largo, descripción larga y duración inválida", async () => {
    const invalid: Array<[string, string, number | null]> = [
      ["Corte", "-0.01", 30],
      ["   ", "10", 30],
      ["x".repeat(81), "10", 30],
      ["Corte", "10", 0],
      ["Corte", "10", -5],
    ];
    for (const [name, price, duration] of invalid) {
      await assert.rejects(as(USERS.owner.id, INSERT_SERVICE, [orgA, name, price, duration, 0]), checkViolation, name);
    }
    await assert.rejects(
      as(USERS.owner.id, "insert into public.services (organization_id, name, price, description) values ($1, 'Corte', 10, $2)", [orgA, "x".repeat(301)]),
      checkViolation,
    );
    // Precio 0 y duración nula sí se aceptan.
    await as(USERS.owner.id, INSERT_SERVICE, [orgA, "Cortesía", "0", null, 0]);
  });

  test("el dueño edita, archiva y restaura; nadie borra", async () => {
    const id = await createService(USERS.owner.id, orgA, "Corte", "20");
    await as(USERS.owner.id, "update public.services set name = 'Corte moderno', price = 30, is_published = false where id = $1", [id]);
    await as(USERS.owner.id, "update public.services set archived_at = now() where id = $1", [id]);

    const [archived] = await as<{ name: string; price: string; archived: boolean }>(
      USERS.owner.id,
      "select name, price::text as price, archived_at is not null as archived from public.services where id = $1",
      [id],
    );
    assert.deepEqual(archived, { name: "Corte moderno", price: "30.00", archived: true });

    await as(USERS.owner.id, "update public.services set archived_at = null where id = $1", [id]);
    await assert.rejects(as(USERS.owner.id, "delete from public.services where id = $1", [id]), denied);
  });

  test("el trabajador consulta pero no crea ni edita", async () => {
    const id = await createService(USERS.owner.id, orgA, "Corte", "20");

    assert.deepEqual(await serviceNames(USERS.worker.id, orgA), ["Corte"]);
    await assert.rejects(createService(USERS.worker.id, orgA, "Otro", "10"), denied);
    await as(USERS.worker.id, "update public.services set price = 1 where id = $1", [id]);
    const [service] = await as<{ price: string }>(USERS.owner.id, "select price::text as price from public.services where id = $1", [id]);
    assert.equal(service.price, "20.00");
  });

  test("un negocio no ve ni modifica servicios de otro, aunque sea del mismo dueño", async () => {
    const [orgA2] = (await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte 2', 'Calle 3', 'norte-dos', '2026-10-01') as id")).map((r) => r.id);
    const idA = await createService(USERS.owner.id, orgA, "Corte A", "20");
    await createService(USERS.owner.id, orgA2, "Corte A2", "25");

    assert.deepEqual(await serviceNames(USERS.owner.id, orgA2), ["Corte A2"]);
    assert.deepEqual(await serviceNames(USERS.ownerB.id, orgA), []);
    assert.deepEqual(await serviceNames(USERS.outsider.id, orgA), []);

    await assert.rejects(createService(USERS.ownerB.id, orgA, "Intruso", "1"), denied);
    await as(USERS.ownerB.id, "update public.services set price = 1 where id = $1", [idA]);
    // No se puede mover un servicio a otro negocio.
    await assert.rejects(
      as(USERS.owner.id, "update public.services set organization_id = $1 where id = $2", [orgA2, idA]),
      denied,
    );
    const [service] = await as<{ price: string }>(USERS.owner.id, "select price::text as price from public.services where id = $1", [idA]);
    assert.equal(service.price, "20.00");
  });

  test("un anónimo no lee servicios ni disponibilidad", async () => {
    await createService(USERS.owner.id, orgA, "Corte", "20");
    await assert.rejects(as(null, "select * from public.services"), denied);
    await assert.rejects(as(null, "select * from public.service_locations"), denied);
  });

  test("un trabajador desactivado pierde el acceso", async () => {
    await createService(USERS.owner.id, orgA, "Corte", "20");
    await as(USERS.owner.id, "select public.set_worker_active($1, $2, false)", [orgA, USERS.worker.id]);
    assert.deepEqual(await serviceNames(USERS.worker.id, orgA), []);
  });

  test("nadie escribe directamente en service_locations", async () => {
    const id = await createService(USERS.owner.id, orgA, "Corte", "20");
    const [shop] = await as<{ id: string }>(USERS.owner.id, "select id from public.barbershops where organization_id = $1", [orgA]);
    await assert.rejects(
      as(USERS.owner.id, "update public.service_locations set is_available = false where service_id = $1", [id]),
      denied,
    );
    await assert.rejects(
      as(USERS.owner.id, "insert into public.service_locations (organization_id, service_id, barbershop_id) values ($1, $2, $3)", [orgA, id, shop.id]),
      denied,
    );
  });

  test("la disponibilidad no cruza negocios", async () => {
    const idA = await createService(USERS.owner.id, orgA, "Corte", "20");
    const [shopB] = await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [orgB]).then((r) => r.rows);
    await assert.rejects(
      db.query("insert into public.service_locations (organization_id, service_id, barbershop_id) values ($1, $2, $3)", [orgA, idA, shopB.id]),
      hasSqlState(SQLSTATE.foreignKeyViolation),
    );
  });
});

describe("reorder_services", () => {
  test("el dueño reordena de forma atómica", async () => {
    const a = await createService(USERS.owner.id, orgA, "A", "10", 1);
    const b = await createService(USERS.owner.id, orgA, "B", "10", 2);
    const c = await createService(USERS.owner.id, orgA, "C", "10", 3);

    await as(USERS.owner.id, "select public.reorder_services($1, $2)", [orgA, [c, a, b]]);
    assert.deepEqual(await serviceNames(USERS.owner.id, orgA), ["C", "A", "B"]);
  });

  test("rechaza listas con repetidos o servicios de otro negocio sin cambiar nada", async () => {
    const a = await createService(USERS.owner.id, orgA, "A", "10", 1);
    const b = await createService(USERS.owner.id, orgA, "B", "10", 2);
    const foreign = await createService(USERS.ownerB.id, orgB, "X", "10", 1);

    await assert.rejects(as(USERS.owner.id, "select public.reorder_services($1, $2)", [orgA, [b, b]]), invalidInput);
    await assert.rejects(as(USERS.owner.id, "select public.reorder_services($1, $2)", [orgA, [b, foreign, a]]), invalidInput);
    await assert.rejects(as(USERS.owner.id, "select public.reorder_services($1, $2)", [orgA, []]), invalidInput);
    assert.deepEqual(await serviceNames(USERS.owner.id, orgA), ["A", "B"]);
    assert.deepEqual(await serviceNames(USERS.ownerB.id, orgB), ["X"]);
  });

  test("solo el dueño del negocio", async () => {
    const a = await createService(USERS.owner.id, orgA, "A", "10", 1);
    await assert.rejects(as(USERS.worker.id, "select public.reorder_services($1, $2)", [orgA, [a]]), denied);
    await assert.rejects(as(USERS.ownerB.id, "select public.reorder_services($1, $2)", [orgA, [a]]), denied);
    await assert.rejects(as(null, "select public.reorder_services($1, $2)", [orgA, [a]]), denied);
  });
});

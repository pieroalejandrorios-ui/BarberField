import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000e1", email: "duena@norte.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000e2", email: "barbero@norte.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000e3", email: "dueno@sur.pe" },
  outsider: { id: "00000000-0000-4000-8000-0000000000e4", email: "nadie@correo.pe" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const checkViolation = hasSqlState(SQLSTATE.checkViolation);
const notNullViolation = hasSqlState(SQLSTATE.notNullViolation);
const duplicate = hasSqlState(SQLSTATE.uniqueViolation);

const INSERT_CUSTOMER = `
  insert into public.customers (organization_id, full_name, dni, phone, consent_by)
  values ($1, $2, $3, $4, $5)
  returning id`;

type SearchRow = { full_name: string; total_count: string };

let db: PGlite;
let orgA: string;
let orgB: string;

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function createCustomer(
  userId: string,
  organizationId: string,
  fullName: string,
  dni: string,
  phone: string,
  consentBy: string | null = userId,
): Promise<string> {
  const [row] = await as<{ id: string }>(userId, INSERT_CUSTOMER, [organizationId, fullName, dni, phone, consentBy]);
  return row.id;
}

async function search(
  userId: string,
  organizationId: string,
  query: string,
  includeArchived = false,
  limit = 20,
  offset = 0,
): Promise<SearchRow[]> {
  return as<SearchRow>(
    userId,
    "select full_name, total_count::text from public.search_customers($1, $2, $3, $4, $5)",
    [organizationId, query, includeArchived, limit, offset],
  );
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  [{ id: orgA }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte', 'Calle 1', 'norte') as id");
  [{ id: orgB }] = await as<{ id: string }>(USERS.ownerB.id, "select public.create_business('Sur', 'Calle 2', 'sur') as id");
  await as(USERS.owner.id, "select * from public.add_worker_by_email($1, $2)", [orgA, USERS.worker.email]);
});

describe("registro de clientes", () => {
  test("acepta un DNI con ceros iniciales y guarda el celular normalizado", async () => {
    const id = await createCustomer(USERS.worker.id, orgA, "  Ana   Pérez ", "00123456", "987 654-321");
    const [row] = await db.query<{
      full_name: string; dni: string; phone: string; consent_by: string; created_by: string; consent_at: Date | null;
    }>("select full_name, dni, phone, consent_by, created_by, consent_at from public.customers where id = $1", [id])
      .then((r) => r.rows);

    assert.equal(row.full_name, "Ana Pérez");
    assert.equal(row.dni, "00123456");
    assert.equal(row.phone, "+51987654321");
    assert.equal(row.consent_by, USERS.worker.id);
    assert.equal(row.created_by, USERS.worker.id);
    assert.ok(row.consent_at);

    for (const phone of ["+51 912 345 678", "51912345678", "(912) 345678"]) {
      const otherId = await createCustomer(USERS.owner.id, orgA, "Otro", String(10000000 + phone.length), phone);
      const [{ phone: saved }] = await db.query<{ phone: string }>("select phone from public.customers where id = $1", [otherId]).then((r) => r.rows);
      assert.equal(saved, "+51912345678", phone);
    }
  });

  test("rechaza DNI y celular inválidos, o datos faltantes", async () => {
    const invalid: Array<[string, string, string]> = [
      ["Ana", "1234567", "987654321"],
      ["Ana", "123456789", "987654321"],
      ["Ana", "1234567a", "987654321"],
      ["Ana", "12345678", "887654321"],
      ["Ana", "12345678", "98765432"],
      ["Ana", "12345678", "+1987654321"],
      ["Ana", "12345678", ""],
      ["Ana", "", "987654321"],
      ["   ", "12345678", "987654321"],
      ["x".repeat(121), "12345678", "987654321"],
    ];
    for (const [name, dni, phone] of invalid) {
      await assert.rejects(createCustomer(USERS.owner.id, orgA, name, dni, phone), checkViolation, `${name}|${dni}|${phone}`);
    }
    await assert.rejects(
      as(USERS.owner.id, "insert into public.customers (organization_id, full_name, dni, phone, consent_by) values ($1, null, '12345678', '987654321', $2)", [orgA, USERS.owner.id]),
      notNullViolation,
    );
  });

  test("rechaza sin consentimiento o con el consentimiento de otra persona", async () => {
    // RLS exige `consent_by = auth.uid()` antes de llegar al NOT NULL.
    await assert.rejects(createCustomer(USERS.worker.id, orgA, "Ana", "12345678", "987654321", null), denied);
    await assert.rejects(createCustomer(USERS.worker.id, orgA, "Ana", "12345678", "987654321", USERS.owner.id), denied);
  });

  test("no se pueden fijar a mano la fecha de consentimiento ni el autor", async () => {
    await assert.rejects(
      as(USERS.owner.id, "insert into public.customers (organization_id, full_name, dni, phone, consent_by, consent_at) values ($1, 'Ana', '12345678', '987654321', $2, '2020-01-01')", [orgA, USERS.owner.id]),
      denied,
    );
    await assert.rejects(
      as(USERS.owner.id, "insert into public.customers (organization_id, full_name, dni, phone, consent_by, created_by) values ($1, 'Ana', '12345678', '987654321', $2, $3)", [orgA, USERS.owner.id, USERS.worker.id]),
      denied,
    );
  });

  test("DNI único por negocio, aunque el cliente esté archivado; permitido en otro negocio", async () => {
    const id = await createCustomer(USERS.owner.id, orgA, "Ana", "12345678", "987654321");
    await as(USERS.owner.id, "update public.customers set archived_at = now() where id = $1", [id]);

    await assert.rejects(createCustomer(USERS.worker.id, orgA, "Otra Ana", "12345678", "912345678"), duplicate);
    await createCustomer(USERS.ownerB.id, orgB, "Ana en Sur", "12345678", "987654321");
  });

  test("permite un celular repetido", async () => {
    await createCustomer(USERS.owner.id, orgA, "Mamá", "11111111", "987654321");
    await createCustomer(USERS.worker.id, orgA, "Hijo", "22222222", "987654321");
    const rows = await as(USERS.owner.id, "select 1 from public.customers where phone = '+51987654321'");
    assert.equal(rows.length, 2);
  });
});

describe("permisos", () => {
  test("el trabajador crea clientes pero no los edita, archiva ni borra", async () => {
    const id = await createCustomer(USERS.worker.id, orgA, "Ana", "12345678", "987654321");

    await as(USERS.worker.id, "update public.customers set full_name = 'Cambiado', archived_at = now() where id = $1", [id]);
    await assert.rejects(as(USERS.worker.id, "delete from public.customers where id = $1", [id]), denied);
    const [row] = await as<{ full_name: string; archived_at: Date | null }>(
      USERS.owner.id,
      "select full_name, archived_at from public.customers where id = $1",
      [id],
    );
    assert.deepEqual(row, { full_name: "Ana", archived_at: null });
  });

  test("el dueño edita, archiva y restaura; no cambia el consentimiento", async () => {
    const id = await createCustomer(USERS.worker.id, orgA, "Ana", "12345678", "987654321");
    await as(USERS.owner.id, "update public.customers set full_name = 'Ana María', phone = '912 345 678', dni = '87654321' where id = $1", [id]);
    await as(USERS.owner.id, "update public.customers set archived_at = now() where id = $1", [id]);
    await as(USERS.owner.id, "update public.customers set archived_at = null where id = $1", [id]);

    const [row] = await as<{ full_name: string; phone: string; dni: string; archived_at: Date | null }>(
      USERS.owner.id,
      "select full_name, phone, dni, archived_at from public.customers where id = $1",
      [id],
    );
    assert.deepEqual(row, { full_name: "Ana María", phone: "+51912345678", dni: "87654321", archived_at: null });

    await assert.rejects(
      as(USERS.owner.id, "update public.customers set consent_by = $1 where id = $2", [USERS.owner.id, id]),
      denied,
    );
    await assert.rejects(as(USERS.owner.id, "delete from public.customers where id = $1", [id]), denied);
  });

  test("un negocio no ve ni modifica clientes de otro, aunque sea del mismo dueño o conozca el ID", async () => {
    const [{ id: orgA2 }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte 2', 'Calle 3', 'norte-dos') as id");
    const id = await createCustomer(USERS.owner.id, orgA, "Ana", "12345678", "987654321");

    assert.equal((await as(USERS.ownerB.id, "select 1 from public.customers where id = $1", [id])).length, 0);
    assert.equal((await as(USERS.outsider.id, "select 1 from public.customers")).length, 0);
    assert.equal((await as(USERS.owner.id, "select 1 from public.customers where organization_id = $1", [orgA2])).length, 0);

    await as(USERS.ownerB.id, "update public.customers set full_name = 'Hackeado' where id = $1", [id]);
    await assert.rejects(createCustomer(USERS.ownerB.id, orgA, "Intruso", "99999999", "987654321"), denied);
    await assert.rejects(createCustomer(USERS.outsider.id, orgA, "Intruso", "99999999", "987654321"), denied);
    // No se mueve un cliente a otro negocio.
    await assert.rejects(
      as(USERS.owner.id, "update public.customers set organization_id = $1 where id = $2", [orgA2, id]),
      denied,
    );
    const [row] = await as<{ full_name: string }>(USERS.owner.id, "select full_name from public.customers where id = $1", [id]);
    assert.equal(row.full_name, "Ana");
  });

  test("un trabajador desactivado pierde el acceso", async () => {
    await createCustomer(USERS.worker.id, orgA, "Ana", "12345678", "987654321");
    await as(USERS.owner.id, "select public.set_worker_active($1, $2, false)", [orgA, USERS.worker.id]);

    assert.equal((await as(USERS.worker.id, "select 1 from public.customers")).length, 0);
    await assert.rejects(createCustomer(USERS.worker.id, orgA, "Beto", "22222222", "987654321"), denied);
    await assert.rejects(search(USERS.worker.id, orgA, ""), denied);
  });

  test("un anónimo no lee clientes ni busca", async () => {
    await assert.rejects(as(null, "select * from public.customers"), denied);
    await assert.rejects(as(null, "select * from public.search_customers($1)", [orgA]), denied);
  });
});

describe("search_customers", () => {
  beforeEach(async () => {
    await createCustomer(USERS.owner.id, orgA, "Ana Pérez", "01234567", "987654321");
    await createCustomer(USERS.owner.id, orgA, "Beto Ramos", "76543210", "912345678");
    await createCustomer(USERS.owner.id, orgA, "Carla 100%", "11223344", "999888777");
    const archived = await createCustomer(USERS.owner.id, orgA, "Ana Archivada", "55555555", "955555555");
    await as(USERS.owner.id, "update public.customers set archived_at = now() where id = $1", [archived]);
    await createCustomer(USERS.ownerB.id, orgB, "Ana de Sur", "01234567", "987654321");
  });

  test("busca por nombre sin distinguir mayúsculas, por DNI y por celular", async () => {
    assert.deepEqual((await search(USERS.worker.id, orgA, "ana")).map((r) => r.full_name), ["Ana Pérez"]);
    assert.deepEqual((await search(USERS.worker.id, orgA, "0123")).map((r) => r.full_name), ["Ana Pérez"]);
    assert.deepEqual((await search(USERS.worker.id, orgA, "345 678")).map((r) => r.full_name), ["Beto Ramos"]);
    assert.deepEqual((await search(USERS.worker.id, orgA, "+51 912")).map((r) => r.full_name), ["Beto Ramos"]);
  });

  test("los comodines se buscan como texto", async () => {
    assert.deepEqual((await search(USERS.owner.id, orgA, "100%")).map((r) => r.full_name), ["Carla 100%"]);
    assert.deepEqual(await search(USERS.owner.id, orgA, "_"), []);
  });

  test("pagina e informa el total", async () => {
    const page1 = await search(USERS.owner.id, orgA, "", false, 2, 0);
    const page2 = await search(USERS.owner.id, orgA, "", false, 2, 2);
    assert.equal(page1.length, 2);
    assert.equal(page2.length, 1);
    assert.equal(page1[0].total_count, "3");
  });

  test("solo el dueño ve los archivados", async () => {
    assert.deepEqual(
      (await search(USERS.owner.id, orgA, "ana", true)).map((r) => r.full_name),
      ["Ana Archivada", "Ana Pérez"],
    );
    await assert.rejects(search(USERS.worker.id, orgA, "ana", true), denied);
  });

  test("no mezcla negocios", async () => {
    await assert.rejects(search(USERS.ownerB.id, orgA, ""), denied);
    assert.deepEqual((await search(USERS.ownerB.id, orgB, "ana")).map((r) => r.full_name), ["Ana de Sur"]);
  });

  test("rechaza parámetros inválidos", async () => {
    const invalid = hasSqlState(SQLSTATE.invalidParameterValue);
    await assert.rejects(search(USERS.owner.id, orgA, "", false, 0), invalid);
    await assert.rejects(search(USERS.owner.id, orgA, "", false, 101), invalid);
    await assert.rejects(search(USERS.owner.id, orgA, "", false, 20, -1), invalid);
  });
});

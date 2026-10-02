import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, applyMigrationsFrom, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const MIGRATION = "20261001200000_accounts_pro_terms.sql";

const USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000f1", email: "duena@norte.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000f2", email: "barbero@norte.pe" },
  client: { id: "00000000-0000-4000-8000-0000000000f3", email: "cliente@correo.pe" },
  other: { id: "00000000-0000-4000-8000-0000000000f4", email: "otra@correo.pe" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const invalid = hasSqlState(SQLSTATE.invalidParameterValue);
const notCurrent = hasSqlState(SQLSTATE.termsNotCurrent);

// Versiones vigentes según la app; la primera prueba verifica que coincidan
// con la base de datos.
async function appVersions(): Promise<{ terms: string; owner: string }> {
  const source = await readFile(new URL("../../src/lib/legal.ts", import.meta.url), "utf8");
  const terms = /TERMS_VERSION = "([^"]+)"/.exec(source)?.[1];
  const owner = /OWNER_TERMS_VERSION = "([^"]+)"/.exec(source)?.[1];
  assert(terms && owner, "src/lib/legal.ts debe declarar ambas versiones");
  return { terms, owner };
}

let db: PGlite;
let VERSION: string;
let OWNER_VERSION: string;

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function createBusiness(userId: string, slug: string, ownerVersion: string | null = OWNER_VERSION): Promise<string> {
  const [row] = await as<{ id: string }>(
    userId,
    "select public.create_business('Barbería', 'Calle 1', $1, $2) as id",
    [slug, ownerVersion],
  );
  return row.id;
}

type Account = { is_pro: boolean; terms_accepted: boolean; owner_terms_pending: boolean };

async function account(userId: string): Promise<Account> {
  const rows = await as<Account>(userId, "select * from public.get_my_account()");
  assert.equal(rows.length, 1);
  return rows[0];
}

async function insertUsers(): Promise<void> {
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
}

beforeEach(async () => {
  ({ terms: VERSION, owner: OWNER_VERSION } = await appVersions());
  db = await createTestDatabase();
  await insertUsers();
});

describe("versiones de los términos", () => {
  test("coinciden en la app y en la base de datos", async () => {
    const [row] = (await db.query<{ terms: string; owner: string }>(
      "select private.terms_version() as terms, private.owner_terms_version() as owner",
    )).rows;
    assert.deepEqual(row, { terms: VERSION, owner: OWNER_VERSION });
  });
});

describe("registro y aceptación de términos", () => {
  test("el registro guarda la aceptación solo si la versión es la vigente", async () => {
    const ids = ["00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102", "00000000-0000-4000-8000-000000000103"];
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@x.pe', $2)", [ids[0], { terms_version: VERSION }]);
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'b@x.pe', $2)", [ids[1], { terms_version: "2000-01-01" }]);
    await db.query("insert into auth.users (id, email) values ($1, 'c@x.pe')", [ids[2]]);

    const { rows } = await db.query<{ user_id: string; terms_version: string | null; accepted: boolean }>(
      "select user_id, terms_version, terms_accepted_at is not null as accepted from public.profiles where user_id = any($1) order by user_id",
      [ids],
    );
    assert.deepEqual(rows, [
      { user_id: ids[0], terms_version: VERSION, accepted: true },
      { user_id: ids[1], terms_version: null, accepted: false },
      { user_id: ids[2], terms_version: null, accepted: false },
    ]);
    assert.equal((await account(ids[0])).terms_accepted, true);
    assert.equal((await account(ids[1])).terms_accepted, false);
  });

  test("una cuenta nueva es normal: sin Pro y con términos por aceptar", async () => {
    assert.deepEqual(await account(USERS.client.id), { is_pro: false, terms_accepted: false, owner_terms_pending: false });
  });

  test("accept_terms exige sesión y la versión vigente", async () => {
    await assert.rejects(as(null, "select public.accept_terms($1)", [VERSION]), denied);
    await assert.rejects(as(USERS.client.id, "select public.accept_terms($1)", ["2000-01-01"]), notCurrent);
    await assert.rejects(as(USERS.client.id, "select public.accept_terms(null)"), notCurrent);

    await as(USERS.client.id, "select public.accept_terms($1)", [VERSION]);
    await as(USERS.client.id, "select public.accept_terms($1)", [VERSION]);
    assert.equal((await account(USERS.client.id)).terms_accepted, true);
  });

  test("las condiciones de dueño solo se aceptan con cuenta Pro y versión vigente", async () => {
    await assert.rejects(as(USERS.client.id, "select public.accept_terms($1, $2)", [VERSION, OWNER_VERSION]), invalid);
    // El error revierte también la aceptación de los términos generales.
    assert.equal((await account(USERS.client.id)).terms_accepted, false);

    await db.query("insert into public.subscriptions (user_id) values ($1)", [USERS.owner.id]);
    assert.equal((await account(USERS.owner.id)).owner_terms_pending, true);
    await assert.rejects(as(USERS.owner.id, "select public.accept_terms($1, $2)", [VERSION, "2000-01-01"]), notCurrent);

    await as(USERS.owner.id, "select public.accept_terms($1, $2)", [VERSION, OWNER_VERSION]);
    assert.deepEqual(await account(USERS.owner.id), { is_pro: true, terms_accepted: true, owner_terms_pending: false });
  });

  test("get_my_account no funciona para anónimos", async () => {
    await assert.rejects(as(null, "select * from public.get_my_account()"), denied);
  });
});

describe("crear negocio convierte la cuenta en Pro", () => {
  test("exige las condiciones de dueño vigentes", async () => {
    await assert.rejects(createBusiness(USERS.client.id, "sin-condiciones", null), notCurrent);
    await assert.rejects(createBusiness(USERS.client.id, "version-vieja", "2000-01-01"), notCurrent);
    const { rows } = await db.query("select 1 from public.organizations");
    assert.equal(rows.length, 0);
    assert.equal((await account(USERS.client.id)).is_pro, false);
  });

  test("ya no existe la versión sin condiciones", async () => {
    const { rows } = await db.query<{ exists: boolean }>(
      "select to_regprocedure('public.create_business(text,text,text)') is not null as exists",
    );
    assert.equal(rows[0].exists, false);
  });

  test("crea la suscripción gratuita con las condiciones aceptadas", async () => {
    await createBusiness(USERS.owner.id, "norte");
    const subscriptions = await as<Record<string, unknown>>(
      USERS.owner.id,
      `select plan, status, provider, current_period_end, owner_terms_version,
              owner_terms_accepted_at is not null as accepted
       from public.subscriptions`,
    );
    assert.deepEqual(subscriptions, [
      { plan: "pro", status: "active", provider: "free", current_period_end: null, owner_terms_version: OWNER_VERSION, accepted: true },
    ]);
    assert.equal((await account(USERS.owner.id)).is_pro, true);

    // Un segundo negocio reutiliza la misma suscripción.
    await createBusiness(USERS.owner.id, "norte-dos");
    const { rows } = await db.query("select 1 from public.subscriptions where user_id = $1", [USERS.owner.id]);
    assert.equal(rows.length, 1);
  });
});

describe("is_pro es el único punto de control del dueño", () => {
  let orgId: string;

  beforeEach(async () => {
    orgId = await createBusiness(USERS.owner.id, "norte");
  });

  async function ownerCanEdit(): Promise<boolean> {
    const rows = await as(USERS.owner.id, "update public.organizations set name = 'Nuevo' where id = $1 returning id", [orgId]);
    return rows.length === 1;
  }

  async function ownerCanOperate(): Promise<boolean> {
    const [row] = await as<{ allowed: boolean }>(
      USERS.owner.id,
      "select private.can_operate_barbershop(id) as allowed from public.barbershops where organization_id = $1",
      [orgId],
    );
    return row?.allowed ?? false;
  }

  test("con suscripción activa el dueño administra y opera", async () => {
    assert.equal(await ownerCanEdit(), true);
    assert.equal(await ownerCanOperate(), true);
  });

  for (const [label, sql] of [
    ["cancelada", "update public.subscriptions set status = 'canceled' where user_id = $1"],
    ["vencida", "update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = $1"],
    ["inexistente", "delete from public.subscriptions where user_id = $1"],
  ] as const) {
    test(`con suscripción ${label} pierde las acciones de dueño`, async () => {
      await db.query(sql, [USERS.owner.id]);
      assert.equal((await account(USERS.owner.id)).is_pro, false);
      assert.equal(await ownerCanEdit(), false);
      assert.equal(await ownerCanOperate(), false);
      await assert.rejects(
        as(USERS.owner.id, "select public.add_worker_by_email($1, $2)", [orgId, USERS.worker.email]),
        denied,
      );
    });
  }

  test("una suscripción con periodo vigente sigue siendo Pro", async () => {
    await db.query("update public.subscriptions set status = 'trialing', current_period_end = now() + interval '30 days' where user_id = $1", [USERS.owner.id]);
    assert.equal(await ownerCanEdit(), true);
  });

  test("el trabajador no depende de la suscripción del dueño ni la obtiene", async () => {
    await as(USERS.owner.id, "select public.add_worker_by_email($1, $2)", [orgId, USERS.worker.email]);
    assert.equal((await account(USERS.worker.id)).is_pro, false);
    const [row] = await as<{ allowed: boolean }>(
      USERS.worker.id,
      "select private.can_operate_barbershop(id) as allowed from public.barbershops where organization_id = $1",
      [orgId],
    );
    assert.equal(row.allowed, true);
  });
});

describe("privacidad de profiles y subscriptions", () => {
  beforeEach(async () => {
    await createBusiness(USERS.owner.id, "norte");
    await as(USERS.client.id, "select public.accept_terms($1)", [VERSION]);
  });

  test("cada usuario ve solo lo suyo y el anónimo nada", async () => {
    assert.equal((await as(USERS.client.id, "select * from public.subscriptions")).length, 0);
    assert.equal((await as(USERS.owner.id, "select * from public.subscriptions")).length, 1);
    assert.deepEqual(
      (await as<{ user_id: string }>(USERS.client.id, "select user_id from public.profiles")).map((r) => r.user_id),
      [USERS.client.id],
    );
    await assert.rejects(as(null, "select * from public.profiles"), denied);
    await assert.rejects(as(null, "select * from public.subscriptions"), denied);
  });

  test("nadie escribe directamente", async () => {
    const writes: [string, unknown[]][] = [
      ["insert into public.subscriptions (user_id) values ($1)", [USERS.client.id]],
      ["update public.subscriptions set status = 'active' where user_id = $1", [USERS.owner.id]],
      ["update public.subscriptions set current_period_end = null where user_id = $1", [USERS.owner.id]],
      ["delete from public.subscriptions where user_id = $1", [USERS.owner.id]],
      ["insert into public.profiles (user_id) values ($1)", [USERS.other.id]],
      ["update public.profiles set terms_version = 'x' where user_id = $1", [USERS.client.id]],
      ["delete from public.profiles where user_id = $1", [USERS.client.id]],
    ];
    for (const [sql, params] of writes) {
      await assert.rejects(as(USERS.owner.id, sql, params), denied, sql);
      await assert.rejects(as(USERS.client.id, sql, params), denied, sql);
    }
  });

  test("las funciones privadas no se pueden llamar desde la API", async () => {
    for (const sql of [
      `select private.is_pro('${USERS.owner.id}')`,
      `select private.grant_pro('${USERS.client.id}', '${OWNER_VERSION}')`,
      "select private.terms_version()",
    ]) {
      await assert.rejects(as(USERS.client.id, sql), denied, sql);
    }
  });
});

describe("migración de dueños existentes", () => {
  test("todo dueño previo pasa a Pro con las condiciones pendientes; trabajadores y cuentas sin negocio no", async () => {
    db = await createTestDatabase({ before: MIGRATION });
    await insertUsers();
    const [{ id: orgId }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte', 'Calle 1', 'norte') as id");
    await as(USERS.owner.id, "select public.add_worker_by_email($1, $2)", [orgId, USERS.worker.email]);

    await applyMigrationsFrom(db, MIGRATION);

    const { rows } = await db.query<{ user_id: string; plan: string; status: string; owner_terms_version: string | null }>(
      "select user_id, plan, status, owner_terms_version from public.subscriptions",
    );
    assert.deepEqual(rows, [{ user_id: USERS.owner.id, plan: "pro", status: "active", owner_terms_version: null }]);
    assert.deepEqual(await account(USERS.owner.id), { is_pro: true, terms_accepted: false, owner_terms_pending: true });
    assert.equal((await account(USERS.worker.id)).is_pro, false);

    // Conserva el acceso de dueño sin interrupción.
    assert.equal((await as(USERS.owner.id, "select * from public.list_team($1)", [orgId])).length, 2);
  });
});

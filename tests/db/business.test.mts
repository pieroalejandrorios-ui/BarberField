import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const USERS = {
  owner: "00000000-0000-4000-8000-0000000000a1",
  worker: "00000000-0000-4000-8000-0000000000a2",
  formerWorker: "00000000-0000-4000-8000-0000000000a3",
  outsider: "00000000-0000-4000-8000-0000000000a4",
} as const;

const deniedByPermissions = hasSqlState(SQLSTATE.insufficientPrivilege);
const invalidInput = hasSqlState(SQLSTATE.invalidParameterValue);
const duplicate = hasSqlState(SQLSTATE.uniqueViolation);
const workerOwnerLimit = hasSqlState(SQLSTATE.workerOwnerLimit);

let db: PGlite;

async function createBusiness(
  userId: string | null,
  name: string,
  address: string,
  slug: string,
): Promise<string> {
  return runAs(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "select public.create_business($1, $2, $3, '2026-10-01') as id",
      [name, address, slug],
    );
    return rows[0].id;
  });
}

async function count(userId: string | null, sql: string, params: unknown[] = []): Promise<number> {
  return runAs(db, userId, async (tx) => (await tx.query(sql, params)).rows.length);
}

// Datos ficticios cargados como superusuario. Las membresías de trabajador
// se insertan directamente porque su función llega en la etapa 2.
beforeEach(async () => {
  db = await createTestDatabase();
  await db.exec(`
    insert into auth.users (id) values
      ('${USERS.owner}'), ('${USERS.worker}'), ('${USERS.formerWorker}'), ('${USERS.outsider}');
  `);
});

async function addWorker(organizationId: string, userId: string, isActive = true): Promise<void> {
  await db.query(
    "insert into public.organization_members (organization_id, user_id, role, is_active) values ($1, $2, 'barber', $3)",
    [organizationId, userId, isActive],
  );
}

describe("create_business", () => {
  test("crea negocio, membresía de dueño y local de forma atómica", async () => {
    const id = await createBusiness(USERS.owner, "  Barbería Lima  ", "Av. Arequipa 123", "barberia-lima");

    const org = await db.query<{ name: string; created_by: string }>(
      "select name, created_by from public.organizations where id = $1",
      [id],
    );
    assert.deepEqual(org.rows, [{ name: "Barbería Lima", created_by: USERS.owner }]);

    const members = await db.query<{ user_id: string; role: string; is_active: boolean }>(
      "select user_id, role, is_active from public.organization_members where organization_id = $1",
      [id],
    );
    assert.deepEqual(members.rows, [{ user_id: USERS.owner, role: "owner", is_active: true }]);

    const shops = await db.query<{ name: string; address: string; slug: string; is_published: boolean }>(
      "select name, address, slug, is_published from public.barbershops where organization_id = $1",
      [id],
    );
    assert.deepEqual(shops.rows, [
      { name: "Barbería Lima", address: "Av. Arequipa 123", slug: "barberia-lima", is_published: false },
    ]);

    // El dueño ve su negocio de inmediato con RLS.
    assert.equal(await count(USERS.owner, "select * from public.organizations where id = $1", [id]), 1);
  });

  test("un mismo usuario crea varios negocios, aislados entre sí", async () => {
    const first = await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    const second = await createBusiness(USERS.owner, "Sur", "Calle 2", "sur");
    assert.notEqual(first, second);

    assert.equal(await count(USERS.owner, "select * from public.organizations"), 2);
    assert.equal(await count(USERS.owner, "select * from public.barbershops"), 2);
    const shops = await db.query<{ organization_id: string }>(
      "select organization_id from public.barbershops order by slug",
    );
    assert.deepEqual(shops.rows.map((row) => row.organization_id), [first, second]);
  });

  test("se rechaza sin sesión", async () => {
    await assert.rejects(createBusiness(null, "Anónima", "Calle 1", "anonima"), deniedByPermissions);
    // `authenticated` sin `sub` tampoco crea nada.
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query("select set_config('role', 'authenticated', true)");
        await tx.query("select public.create_business('Sin sesión', 'Calle 1', 'sin-sesion', '2026-10-01')");
      }),
      deniedByPermissions,
    );
    assert.equal((await db.query("select 1 from public.organizations")).rows.length, 0);
  });

  test("se rechaza un slug duplicado sin dejar datos a medias", async () => {
    await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    await assert.rejects(createBusiness(USERS.outsider, "Otra Norte", "Calle 9", "norte"), duplicate);

    assert.equal((await db.query("select 1 from public.organizations")).rows.length, 1);
    assert.equal(
      (await db.query("select 1 from public.organization_members where user_id = $1", [USERS.outsider])).rows.length,
      0,
    );
    assert.equal(await count(USERS.outsider, "select * from public.organizations"), 0);
  });

  test("se rechazan datos inválidos", async () => {
    const cases: Array<[string, string, string]> = [
      ["", "Calle 1", "valido"],
      ["   ", "Calle 1", "valido"],
      ["x".repeat(121), "Calle 1", "valido"],
      ["Barbería", "", "valido"],
      ["Barbería", "x".repeat(201), "valido"],
      ["Barbería", "Calle 1", "ab"],
      ["Barbería", "Calle 1", "a".repeat(61)],
      ["Barbería", "Calle 1", "Mayusculas"],
      ["Barbería", "Calle 1", "con espacio"],
      ["Barbería", "Calle 1", "-inicio"],
      ["Barbería", "Calle 1", "doble--guion"],
      ["Barbería", "Calle 1", "peluquería"],
    ];
    for (const [name, address, slug] of cases) {
      await assert.rejects(createBusiness(USERS.owner, name, address, slug), invalidInput, `${name}|${address}|${slug}`);
    }
    assert.equal((await db.query("select 1 from public.organizations")).rows.length, 0);
  });

  // Etapa 11: un trabajador activo también puede crear su negocio (pasa a Pro).
  test("un trabajador activo o desactivado puede crear su negocio", async () => {
    const orgId = await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    await addWorker(orgId, USERS.worker);
    await addWorker(orgId, USERS.formerWorker, false);

    const own = await createBusiness(USERS.worker, "Propia", "Calle 2", "propia");
    assert.equal(await count(USERS.worker, "select * from public.organizations"), 2);
    assert.equal(await count(USERS.worker, "select * from public.organizations where id = $1", [own]), 1);

    const other = await createBusiness(USERS.formerWorker, "Nueva", "Calle 3", "nueva");
    assert.equal(await count(USERS.formerWorker, "select * from public.organizations where id = $1", [other]), 1);
  });

  test("un anónimo no puede ejecutar la función", async () => {
    await assert.rejects(
      runAs(db, null, (tx) => tx.query("select public.create_business('A', 'B', 'abc', '2026-10-01')")),
      deniedByPermissions,
    );
  });
});

describe("membresías", () => {
  test("nadie inserta directamente en organization_members", async () => {
    const orgId = await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    for (const [userId, target] of [
      [USERS.owner, USERS.outsider],
      [USERS.outsider, USERS.outsider],
    ] as const) {
      await assert.rejects(
        count(
          userId,
          "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'barber')",
          [orgId, target],
        ),
        deniedByPermissions,
      );
    }
  });

  test("nadie cambia el rol directamente, ni siquiera el dueño", async () => {
    const orgId = await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    await addWorker(orgId, USERS.worker);
    await assert.rejects(
      count(
        USERS.owner,
        "update public.organization_members set role = 'owner' where organization_id = $1 and user_id = $2",
        [orgId, USERS.worker],
      ),
      deniedByPermissions,
    );
  });

  // Etapa 11: hasta 3 dueños distintos; el trigger lo valida incluso en
  // escrituras directas.
  test("un trabajador activo trabaja para como máximo 3 dueños distintos", async () => {
    const owners = [USERS.owner, USERS.outsider, USERS.formerWorker, "00000000-0000-4000-8000-0000000000a5"];
    await db.query("insert into auth.users (id) values ($1)", [owners[3]]);
    const orgs: string[] = [];
    for (const [index, owner] of owners.entries()) {
      orgs.push(await createBusiness(owner, `Negocio ${index}`, "Calle 1", `negocio-${index}`));
    }

    for (const org of orgs.slice(0, 3)) await addWorker(org, USERS.worker);
    await assert.rejects(addWorker(orgs[3], USERS.worker), workerOwnerLimit);
    await addWorker(orgs[3], USERS.worker, false);
    const reactivate = "update public.organization_members set is_active = true where organization_id = $1 and user_id = $2";
    await assert.rejects(db.query(reactivate, [orgs[3], USERS.worker]), workerOwnerLimit);

    // Al dejar uno, puede activarse en el cuarto.
    await db.query(
      "update public.organization_members set is_active = false where organization_id = $1 and user_id = $2",
      [orgs[0], USERS.worker],
    );
    await db.query(reactivate, [orgs[3], USERS.worker]);
  });
});

describe("datos públicos del local", () => {
  async function updateShop(column: string, value: string): Promise<void> {
    await db.query(`update public.barbershops set ${column} = $1`, [value]);
  }

  test("se validan con CHECK", async () => {
    await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    const checkViolation = hasSqlState(SQLSTATE.checkViolation);

    await assert.rejects(updateShop("maps_url", "http://maps.google.com/x"), checkViolation);
    await assert.rejects(updateShop("maps_url", "https://evil.com/maps"), checkViolation);
    await assert.rejects(updateShop("phone", "987654321"), checkViolation);
    await assert.rejects(updateShop("description", "x".repeat(1001)), checkViolation);
    await assert.rejects(updateShop("hours_note", "x".repeat(201)), checkViolation);

    await updateShop("maps_url", "https://maps.app.goo.gl/abc123");
    await updateShop("maps_url", "https://www.google.com/maps/place/Lima");
    await updateShop("phone", "+51987654321");
    await updateShop("phone", "+5114567890");
  });

  test("solo el dueño los modifica", async () => {
    const orgId = await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    await addWorker(orgId, USERS.worker);

    await count(USERS.worker, "update public.barbershops set description = 'Del trabajador'");
    await count(USERS.outsider, "update public.barbershops set description = 'Ajena'");
    const before = await db.query<{ description: string | null }>("select description from public.barbershops");
    assert.equal(before.rows[0].description, null);

    await count(USERS.owner, "update public.barbershops set description = 'Cortes clásicos', is_published = true");
    const after = await db.query<{ description: string; is_published: boolean }>(
      "select description, is_published from public.barbershops",
    );
    assert.deepEqual(after.rows, [{ description: "Cortes clásicos", is_published: true }]);
  });

  test("un anónimo no lee los locales", async () => {
    await createBusiness(USERS.owner, "Norte", "Calle 1", "norte");
    await assert.rejects(count(null, "select * from public.barbershops"), deniedByPermissions);
  });
});

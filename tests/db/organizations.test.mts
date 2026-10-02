import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const USERS = {
  ownerA: "00000000-0000-4000-8000-00000000000a",
  barberA: "00000000-0000-4000-8000-00000000000b",
  unassignedBarberA: "00000000-0000-4000-8000-00000000000c",
  ownerB: "00000000-0000-4000-8000-00000000000d",
  outsider: "00000000-0000-4000-8000-00000000000e",
  newcomer: "00000000-0000-4000-8000-00000000000f",
} as const;

const ORG_A = "10000000-0000-4000-8000-00000000000a";
const ORG_B = "10000000-0000-4000-8000-00000000000b";
const SHOP_A1 = "20000000-0000-4000-8000-0000000000a1";
const SHOP_A2 = "20000000-0000-4000-8000-0000000000a2";
const SHOP_B1 = "20000000-0000-4000-8000-0000000000b1";

const deniedByPermissions = hasSqlState(SQLSTATE.insufficientPrivilege);

let db: PGlite;

// Datos de prueba ficticios, cargados como superusuario (sin RLS).
async function seed(database: PGlite): Promise<void> {
  await database.exec(`
    insert into auth.users (id) values
      ('${USERS.ownerA}'), ('${USERS.barberA}'), ('${USERS.unassignedBarberA}'),
      ('${USERS.ownerB}'), ('${USERS.outsider}'), ('${USERS.newcomer}');

    insert into public.organizations (id, name) values
      ('${ORG_A}', 'Barbería Norte'), ('${ORG_B}', 'Barbería Sur');

    insert into public.barbershops (id, organization_id, name, address) values
      ('${SHOP_A1}', '${ORG_A}', 'Norte Miraflores', 'Av. Larco 100'),
      ('${SHOP_A2}', '${ORG_A}', 'Norte Surco', null),
      ('${SHOP_B1}', '${ORG_B}', 'Sur Barranco', null);

    insert into public.organization_members (organization_id, user_id, role) values
      ('${ORG_A}', '${USERS.ownerA}', 'owner'),
      ('${ORG_A}', '${USERS.barberA}', 'barber'),
      ('${ORG_A}', '${USERS.unassignedBarberA}', 'barber'),
      ('${ORG_B}', '${USERS.ownerB}', 'owner');

    insert into public.barbershop_members (organization_id, barbershop_id, user_id) values
      ('${ORG_A}', '${SHOP_A1}', '${USERS.barberA}');
  `);
}

async function count(userId: string | null, sql: string, params: unknown[] = []): Promise<number> {
  return runAs(db, userId, async (tx) => (await tx.query(sql, params)).rows.length);
}

async function canOperate(userId: string, barbershopId: string): Promise<boolean> {
  return runAs(db, userId, async (tx) => {
    const { rows } = await tx.query<{ allowed: boolean }>(
      "select private.can_operate_barbershop($1) as allowed",
      [barbershopId],
    );
    return rows[0].allowed;
  });
}

beforeEach(async () => {
  db = await createTestDatabase();
  await seed(db);
});

describe("acceso anónimo", () => {
  for (const table of ["organizations", "barbershops", "organization_members", "barbershop_members"]) {
    test(`no puede leer ${table}`, async () => {
      await assert.rejects(count(null, `select * from public.${table}`), deniedByPermissions);
    });
  }

  test("no puede ejecutar funciones de autorización", async () => {
    await assert.rejects(
      count(null, "select private.can_operate_barbershop($1)", [SHOP_A1]),
      deniedByPermissions,
    );
  });
});

describe("aislamiento entre negocios", () => {
  test("un usuario sin membresía no ve datos", async () => {
    for (const table of ["organizations", "barbershops", "organization_members", "barbershop_members"]) {
      assert.equal(await count(USERS.outsider, `select * from public.${table}`), 0, table);
    }
  });

  test("el dueño ve solo su negocio aunque pida IDs ajenos", async () => {
    assert.equal(await count(USERS.ownerA, "select * from public.organizations"), 1);
    assert.equal(await count(USERS.ownerA, "select * from public.barbershops"), 2);
    assert.equal(await count(USERS.ownerA, "select * from public.organization_members"), 3);
    assert.equal(await count(USERS.ownerA, "select * from public.organizations where id = $1", [ORG_B]), 0);
    assert.equal(await count(USERS.ownerA, "select * from public.barbershops where id = $1", [SHOP_B1]), 0);
  });

  test("el barbero ve su negocio, pero solo su propia membresía y asignación", async () => {
    assert.equal(await count(USERS.barberA, "select * from public.organizations"), 1);
    assert.equal(await count(USERS.barberA, "select * from public.barbershops"), 2);
    assert.equal(await count(USERS.barberA, "select * from public.organization_members"), 1);
    assert.equal(await count(USERS.barberA, "select * from public.barbershop_members"), 1);
  });

  test("nadie crea negocios directamente (solo con create_business)", async () => {
    await assert.rejects(
      count(USERS.outsider, "insert into public.organizations (name) values ('Nuevo')"),
      deniedByPermissions,
    );
  });
});

describe("administración de locales", () => {
  test("el dueño crea locales solo en su negocio", async () => {
    await count(USERS.ownerA, "insert into public.barbershops (organization_id, name) values ($1, 'Norte Centro')", [ORG_A]);
    assert.equal(await count(USERS.ownerA, "select * from public.barbershops"), 3);

    await assert.rejects(
      count(USERS.ownerA, "insert into public.barbershops (organization_id, name) values ($1, 'Intruso')", [ORG_B]),
      deniedByPermissions,
    );
  });

  test("el barbero no crea ni modifica locales", async () => {
    await assert.rejects(
      count(USERS.barberA, "insert into public.barbershops (organization_id, name) values ($1, 'Otro')", [ORG_A]),
      deniedByPermissions,
    );
    await count(USERS.barberA, "update public.barbershops set name = 'Cambiado' where id = $1", [SHOP_A1]);
    const { rows } = await db.query<{ name: string }>("select name from public.barbershops where id = $1", [SHOP_A1]);
    assert.equal(rows[0].name, "Norte Miraflores");
  });

  test("el dueño no modifica locales ajenos ni mueve locales entre negocios", async () => {
    await count(USERS.ownerA, "update public.barbershops set name = 'Hackeado' where id = $1", [SHOP_B1]);
    const { rows } = await db.query<{ name: string }>("select name from public.barbershops where id = $1", [SHOP_B1]);
    assert.equal(rows[0].name, "Sur Barranco");

    await assert.rejects(
      count(USERS.ownerA, "update public.barbershops set organization_id = $1 where id = $2", [ORG_B, SHOP_A1]),
      deniedByPermissions,
    );
  });

  test("los locales se archivan, no se eliminan", async () => {
    await assert.rejects(
      count(USERS.ownerA, "delete from public.barbershops where id = $1", [SHOP_A2]),
      deniedByPermissions,
    );
    await count(USERS.ownerA, "update public.barbershops set archived_at = now() where id = $1", [SHOP_A2]);
    const { rows } = await db.query("select 1 from public.barbershops where id = $1 and archived_at is not null", [SHOP_A2]);
    assert.equal(rows.length, 1);
  });
});

describe("membresías y roles", () => {
  test("nadie incorpora miembros directamente, ni siquiera el dueño", async () => {
    const addBarber = "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'barber')";
    await assert.rejects(count(USERS.barberA, addBarber, [ORG_A, USERS.newcomer]), deniedByPermissions);
    await assert.rejects(count(USERS.ownerA, addBarber, [ORG_B, USERS.newcomer]), deniedByPermissions);
    await assert.rejects(count(USERS.ownerA, addBarber, [ORG_A, USERS.newcomer]), deniedByPermissions);
    assert.equal(await count(USERS.newcomer, "select * from public.organizations"), 0);
  });

  test("nadie se autoasigna a un negocio existente", async () => {
    await assert.rejects(
      count(USERS.outsider, "insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [ORG_A, USERS.outsider]),
      deniedByPermissions,
    );
  });

  test("nadie cambia roles directamente", async () => {
    const promote = "update public.organization_members set role = 'owner' where user_id = $1";
    await assert.rejects(count(USERS.barberA, promote, [USERS.barberA]), deniedByPermissions);
    await assert.rejects(count(USERS.ownerA, promote, [USERS.barberA]), deniedByPermissions);
    const { rows } = await db.query<{ role: string }>(
      "select role from public.organization_members where organization_id = $1 and user_id = $2",
      [ORG_A, USERS.barberA],
    );
    assert.equal(rows[0].role, "barber");
  });

  test("una membresía desactivada pierde acceso con la sesión todavía activa", async () => {
    await count(USERS.ownerA, "select public.set_worker_active($1, $2, false)", [ORG_A, USERS.barberA]);

    assert.equal(await count(USERS.barberA, "select * from public.organizations"), 0);
    assert.equal(await count(USERS.barberA, "select * from public.barbershops"), 0);
    assert.equal(await count(USERS.barberA, "select * from public.barbershop_members"), 0);
    assert.equal(await canOperate(USERS.barberA, SHOP_A1), false);
    // Conserva la vista de su propia membresía para que la interfaz pueda explicarlo.
    assert.equal(await count(USERS.barberA, "select * from public.organization_members where not is_active"), 1);
  });

  test("el negocio conserva al menos un dueño activo", async () => {
    // La app ya no actualiza membresías directamente; el trigger protege igual.
    const deactivate = "update public.organization_members set is_active = false where organization_id = $1 and user_id = $2";
    const demote = "update public.organization_members set role = 'barber' where organization_id = $1 and user_id = $2";

    await assert.rejects(count(USERS.ownerA, deactivate, [ORG_A, USERS.ownerA]), deniedByPermissions);
    await assert.rejects(db.query(deactivate, [ORG_A, USERS.ownerA]), hasSqlState(SQLSTATE.checkViolation));
    await assert.rejects(db.query(demote, [ORG_A, USERS.ownerA]), hasSqlState(SQLSTATE.checkViolation));

    await db.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [ORG_A, USERS.newcomer]);
    await db.query(deactivate, [ORG_A, USERS.ownerA]);
    const { rows } = await db.query<{ is_active: boolean }>(
      "select is_active from public.organization_members where organization_id = $1 and user_id = $2",
      [ORG_A, USERS.ownerA],
    );
    assert.equal(rows[0].is_active, false);
  });
});

describe("asignación de barberos a locales", () => {
  test("no se vincula un local con un miembro de otro negocio", async () => {
    // Ni siquiera sin RLS: lo impiden las claves foráneas compuestas.
    await assert.rejects(
      db.query("insert into public.barbershop_members (organization_id, barbershop_id, user_id) values ($1, $2, $3)", [ORG_A, SHOP_B1, USERS.barberA]),
      hasSqlState(SQLSTATE.foreignKeyViolation),
    );
    await assert.rejects(
      db.query("insert into public.barbershop_members (organization_id, barbershop_id, user_id) values ($1, $2, $3)", [ORG_B, SHOP_B1, USERS.barberA]),
      hasSqlState(SQLSTATE.foreignKeyViolation),
    );
  });

  test("solo el dueño asigna y retira barberos", async () => {
    const assign = "insert into public.barbershop_members (organization_id, barbershop_id, user_id) values ($1, $2, $3)";
    await assert.rejects(count(USERS.barberA, assign, [ORG_A, SHOP_A2, USERS.barberA]), deniedByPermissions);

    await count(USERS.ownerA, assign, [ORG_A, SHOP_A2, USERS.unassignedBarberA]);
    assert.equal(await canOperate(USERS.unassignedBarberA, SHOP_A2), true);

    await count(USERS.ownerA, "delete from public.barbershop_members where barbershop_id = $1 and user_id = $2", [SHOP_A2, USERS.unassignedBarberA]);
    assert.equal(await canOperate(USERS.unassignedBarberA, SHOP_A2), false);
  });

  test("permisos de operación por local", async () => {
    assert.equal(await canOperate(USERS.ownerA, SHOP_A1), true);
    assert.equal(await canOperate(USERS.ownerA, SHOP_A2), true);
    assert.equal(await canOperate(USERS.barberA, SHOP_A1), true);
    assert.equal(await canOperate(USERS.barberA, SHOP_A2), false);
    assert.equal(await canOperate(USERS.unassignedBarberA, SHOP_A1), false);
    assert.equal(await canOperate(USERS.ownerA, SHOP_B1), false);
    assert.equal(await canOperate(USERS.outsider, SHOP_A1), false);
  });

  test("nadie opera en un local archivado", async () => {
    await count(USERS.ownerA, "update public.barbershops set archived_at = now() where id = $1", [SHOP_A1]);
    assert.equal(await canOperate(USERS.ownerA, SHOP_A1), false);
    assert.equal(await canOperate(USERS.barberA, SHOP_A1), false);
  });
});

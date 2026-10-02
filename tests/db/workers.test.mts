import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

// Etapa 11: un trabajador puede trabajar para hasta 3 dueños distintos.

const USERS = {
  ownerA: { id: "00000000-0000-4000-8000-0000000000c1", email: "a@duenos.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000c2", email: "b@duenos.pe" },
  ownerC: { id: "00000000-0000-4000-8000-0000000000c3", email: "c@duenos.pe" },
  ownerD: { id: "00000000-0000-4000-8000-0000000000c4", email: "d@duenos.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000c5", email: "barbero@correo.pe" },
} as const;

const limit = hasSqlState(SQLSTATE.workerOwnerLimit);
const denied = hasSqlState(SQLSTATE.insufficientPrivilege);

let db: PGlite;
const orgs: Record<string, string> = {};

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function createBusiness(userId: string, slug: string): Promise<string> {
  const [row] = await as<{ id: string }>(
    userId,
    "select public.create_business($1, 'Calle 1', $2, '2026-10-01') as id",
    [`Barbería ${slug}`, slug],
  );
  return row.id;
}

async function addWorker(ownerId: string, organizationId: string, email: string = USERS.worker.email): Promise<void> {
  await as(ownerId, "select public.add_worker_by_email($1, $2)", [organizationId, email]);
}

async function setActive(ownerId: string, organizationId: string, active: boolean): Promise<void> {
  await as(ownerId, "select public.set_worker_active($1, $2, $3)", [organizationId, USERS.worker.id, active]);
}

async function canOperate(userId: string, organizationId: string): Promise<boolean> {
  const [row] = await as<{ allowed: boolean }>(
    userId,
    "select private.can_operate_barbershop(id) as allowed from public.barbershops where organization_id = $1",
    [organizationId],
  );
  return row?.allowed ?? false;
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  orgs.a = await createBusiness(USERS.ownerA.id, "norte");
  orgs.a2 = await createBusiness(USERS.ownerA.id, "norte-dos");
  orgs.b = await createBusiness(USERS.ownerB.id, "sur");
  orgs.c = await createBusiness(USERS.ownerC.id, "este");
  orgs.d = await createBusiness(USERS.ownerD.id, "oeste");
});

describe("límite de 3 dueños distintos", () => {
  test("acepta 3 dueños y rechaza el cuarto", async () => {
    await addWorker(USERS.ownerA.id, orgs.a);
    await addWorker(USERS.ownerB.id, orgs.b);
    await addWorker(USERS.ownerC.id, orgs.c);
    await assert.rejects(addWorker(USERS.ownerD.id, orgs.d), limit);

    assert.equal(await canOperate(USERS.worker.id, orgs.d), false);
    const { rows } = await db.query("select 1 from public.organization_members where organization_id = $1 and user_id = $2", [
      orgs.d,
      USERS.worker.id,
    ]);
    assert.equal(rows.length, 0);
  });

  test("dos negocios del mismo dueño cuentan como uno", async () => {
    await addWorker(USERS.ownerA.id, orgs.a);
    await addWorker(USERS.ownerA.id, orgs.a2);
    await addWorker(USERS.ownerB.id, orgs.b);
    await addWorker(USERS.ownerC.id, orgs.c);
    for (const org of [orgs.a, orgs.a2, orgs.b, orgs.c]) assert.equal(await canOperate(USERS.worker.id, org), true);
    await assert.rejects(addWorker(USERS.ownerD.id, orgs.d), limit);
  });

  test("los trabajos desactivados no cuentan, y reactivar vuelve a validar", async () => {
    await addWorker(USERS.ownerA.id, orgs.a);
    await addWorker(USERS.ownerB.id, orgs.b);
    await addWorker(USERS.ownerC.id, orgs.c);

    await setActive(USERS.ownerA.id, orgs.a, false);
    await addWorker(USERS.ownerD.id, orgs.d);
    await assert.rejects(setActive(USERS.ownerA.id, orgs.a, true), limit);
    // Volver a agregarlo por correo también se rechaza.
    await assert.rejects(addWorker(USERS.ownerA.id, orgs.a), limit);
    assert.equal(await canOperate(USERS.worker.id, orgs.a), false);

    await setActive(USERS.ownerD.id, orgs.d, false);
    await setActive(USERS.ownerA.id, orgs.a, true);
    assert.equal(await canOperate(USERS.worker.id, orgs.a), true);
  });

  test("ser dueño de su propio negocio no cuenta para el límite", async () => {
    await createBusiness(USERS.worker.id, "propia");
    await addWorker(USERS.ownerA.id, orgs.a);
    await addWorker(USERS.ownerB.id, orgs.b);
    await addWorker(USERS.ownerC.id, orgs.c);
    await assert.rejects(addWorker(USERS.ownerD.id, orgs.d), limit);
  });

  test("el trigger valida también escrituras que no pasan por las funciones", async () => {
    for (const org of [orgs.a, orgs.b, orgs.c]) {
      await db.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'barber')", [org, USERS.worker.id]);
    }
    await assert.rejects(
      db.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'barber')", [orgs.d, USERS.worker.id]),
      limit,
    );
  });
});

describe("trabajador en varios negocios", () => {
  test("cada negocio sigue aislado y desactivar en uno no afecta al otro", async () => {
    await addWorker(USERS.ownerA.id, orgs.a);
    await addWorker(USERS.ownerB.id, orgs.b);

    const visible = await as<{ id: string }>(USERS.worker.id, "select id from public.organizations order by id");
    assert.deepEqual(visible.map((o) => o.id).sort(), [orgs.a, orgs.b].sort());

    await setActive(USERS.ownerA.id, orgs.a, false);
    assert.equal(await canOperate(USERS.worker.id, orgs.a), false);
    assert.equal(await canOperate(USERS.worker.id, orgs.b), true);

    // Ningún dueño administra al trabajador en el negocio del otro.
    await assert.rejects(as(USERS.ownerA.id, "select public.set_worker_active($1, $2, false)", [orgs.b, USERS.worker.id]), denied);
  });

  test("un dueño Pro puede ser trabajador de otro dueño y conserva su negocio", async () => {
    await addWorker(USERS.ownerA.id, orgs.a, USERS.ownerB.email);
    assert.equal(await canOperate(USERS.ownerB.id, orgs.a), true);
    assert.equal(await canOperate(USERS.ownerB.id, orgs.b), true);

    // Como trabajador no obtiene acciones de dueño en el negocio ajeno.
    await assert.rejects(as(USERS.ownerB.id, "select * from public.get_business_report($1, current_date, current_date)", [orgs.a]), denied);
    const [account] = await as<{ is_pro: boolean }>(USERS.ownerB.id, "select is_pro from public.get_my_account()");
    assert.equal(account.is_pro, true);
  });

  test("un trabajador activo puede crear su negocio y pasa a Pro", async () => {
    await addWorker(USERS.ownerA.id, orgs.a);
    const own = await createBusiness(USERS.worker.id, "propia");
    assert.equal(await canOperate(USERS.worker.id, own), true);
    assert.equal(await canOperate(USERS.worker.id, orgs.a), true);
    const [account] = await as<{ is_pro: boolean }>(USERS.worker.id, "select is_pro from public.get_my_account()");
    assert.equal(account.is_pro, true);
  });

  test("el dueño no puede agregarse como trabajador de su propio negocio", async () => {
    await assert.rejects(addWorker(USERS.ownerA.id, orgs.a, USERS.ownerA.email), hasSqlState(SQLSTATE.addingSelf));
  });
});

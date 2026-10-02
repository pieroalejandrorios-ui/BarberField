import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const USERS = {
  ownerA: { id: "00000000-0000-4000-8000-0000000000b1", email: "duena@norte.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000b2", email: "dueno@sur.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000b3", email: "Barbero@Correo.pe" },
  other: { id: "00000000-0000-4000-8000-0000000000b4", email: "otro@correo.pe" },
} as const;

type TeamRow = { user_id: string; email: string; role: string; is_active: boolean };

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);

let db: PGlite;
let orgA: string;
let orgB: string;

async function createBusiness(userId: string, slug: string): Promise<string> {
  return runAs(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "select public.create_business($1, 'Calle 1', $2) as id",
      [`Barbería ${slug}`, slug],
    );
    return rows[0].id;
  });
}

async function addWorker(actorId: string | null, organizationId: string, email: string) {
  return runAs(db, actorId, async (tx) => {
    const { rows } = await tx.query<{ user_id: string; email: string }>(
      "select * from public.add_worker_by_email($1, $2)",
      [organizationId, email],
    );
    return rows[0];
  });
}

async function setActive(actorId: string, organizationId: string, userId: string, active: boolean) {
  await runAs(db, actorId, (tx) =>
    tx.query("select public.set_worker_active($1, $2, $3)", [organizationId, userId, active]),
  );
}

async function listTeam(actorId: string | null, organizationId: string): Promise<TeamRow[]> {
  return runAs(db, actorId, async (tx) => {
    const { rows } = await tx.query<TeamRow>(
      "select user_id, email, role, is_active from public.list_team($1)",
      [organizationId],
    );
    return rows;
  });
}

async function canOperate(userId: string, organizationId: string): Promise<boolean> {
  return runAs(db, userId, async (tx) => {
    const { rows } = await tx.query<{ allowed: boolean }>(
      "select private.can_operate_barbershop(b.id) as allowed from public.barbershops b where b.organization_id = $1",
      [organizationId],
    );
    return rows[0]?.allowed ?? false;
  });
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  orgA = await createBusiness(USERS.ownerA.id, "norte");
  orgB = await createBusiness(USERS.ownerB.id, "sur");
});

describe("add_worker_by_email", () => {
  test("agrega por correo existente (sin distinguir mayúsculas) y asigna el local", async () => {
    const added = await addWorker(USERS.ownerA.id, orgA, "  barbero@correo.PE ");
    assert.deepEqual(added, { user_id: USERS.worker.id, email: USERS.worker.email });

    assert.equal(await canOperate(USERS.worker.id, orgA), true);
    const assignments = await db.query(
      "select 1 from public.barbershop_members where organization_id = $1 and user_id = $2",
      [orgA, USERS.worker.id],
    );
    assert.equal(assignments.rows.length, 1);
  });

  test("rechaza un correo inexistente o inválido", async () => {
    await assert.rejects(addWorker(USERS.ownerA.id, orgA, "nadie@correo.pe"), hasSqlState(SQLSTATE.accountNotFound));
    await assert.rejects(addWorker(USERS.ownerA.id, orgA, "sin-arroba"), hasSqlState(SQLSTATE.invalidParameterValue));
  });

  test("rechaza al propio dueño, a un dueño de otro negocio y a un trabajador ya activo", async () => {
    await assert.rejects(addWorker(USERS.ownerA.id, orgA, USERS.ownerA.email), hasSqlState(SQLSTATE.addingSelf));
    await assert.rejects(addWorker(USERS.ownerA.id, orgA, USERS.ownerB.email), hasSqlState(SQLSTATE.ownsBusiness));

    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await assert.rejects(addWorker(USERS.ownerA.id, orgA, USERS.worker.email), hasSqlState(SQLSTATE.alreadyWorker));
  });

  test("rechaza a un trabajador activo de otro negocio", async () => {
    await addWorker(USERS.ownerB.id, orgB, USERS.worker.email);
    await assert.rejects(addWorker(USERS.ownerA.id, orgA, USERS.worker.email), hasSqlState(SQLSTATE.worksElsewhere));
    assert.equal(await canOperate(USERS.worker.id, orgA), false);
  });

  test("acepta a quien dejó de trabajar en otro negocio", async () => {
    await addWorker(USERS.ownerB.id, orgB, USERS.worker.email);
    await setActive(USERS.ownerB.id, orgB, USERS.worker.id, false);
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    assert.equal(await canOperate(USERS.worker.id, orgA), true);
  });

  test("volver a agregar a un trabajador desactivado lo reactiva", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await setActive(USERS.ownerA.id, orgA, USERS.worker.id, false);
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    const team = await listTeam(USERS.ownerA.id, orgA);
    assert.deepEqual(
      team.filter((m) => m.user_id === USERS.worker.id).map((m) => m.is_active),
      [true],
    );
  });

  test("solo el dueño del negocio agrega trabajadores", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await assert.rejects(addWorker(USERS.worker.id, orgA, USERS.other.email), denied);
    await assert.rejects(addWorker(USERS.ownerB.id, orgA, USERS.other.email), denied);
    await assert.rejects(addWorker(USERS.other.id, orgA, USERS.other.email), denied);
    await assert.rejects(addWorker(null, orgA, USERS.other.email), denied);
  });

  test("un dueño con dos negocios no mezcla equipos", async () => {
    const orgA2 = await createBusiness(USERS.ownerA.id, "norte-dos");
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);

    assert.equal(await canOperate(USERS.worker.id, orgA2), false);
    assert.deepEqual(
      (await listTeam(USERS.ownerA.id, orgA2)).map((m) => m.user_id),
      [USERS.ownerA.id],
    );
  });
});

describe("set_worker_active", () => {
  test("desactivar quita el acceso aunque la sesión siga abierta", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await setActive(USERS.ownerA.id, orgA, USERS.worker.id, false);

    assert.equal(await canOperate(USERS.worker.id, orgA), false);
    const visible = await runAs(db, USERS.worker.id, (tx) => tx.query("select * from public.organizations"));
    assert.equal(visible.rows.length, 0);
    await assert.rejects(listTeam(USERS.worker.id, orgA), denied);
  });

  test("rechaza la reactivación si ya trabaja en otro negocio o si ahora es dueño", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await setActive(USERS.ownerA.id, orgA, USERS.worker.id, false);
    await addWorker(USERS.ownerB.id, orgB, USERS.worker.email);

    await assert.rejects(setActive(USERS.ownerA.id, orgA, USERS.worker.id, true), hasSqlState(SQLSTATE.worksElsewhere));

    await setActive(USERS.ownerB.id, orgB, USERS.worker.id, false);
    await createBusiness(USERS.worker.id, "propia");
    await assert.rejects(setActive(USERS.ownerA.id, orgA, USERS.worker.id, true), hasSqlState(SQLSTATE.ownsBusiness));
  });

  test("reactiva cuando las reglas lo permiten", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await setActive(USERS.ownerA.id, orgA, USERS.worker.id, false);
    await setActive(USERS.ownerA.id, orgA, USERS.worker.id, true);
    assert.equal(await canOperate(USERS.worker.id, orgA), true);
  });

  test("solo el dueño y solo sobre trabajadores de su negocio", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);

    await assert.rejects(setActive(USERS.worker.id, orgA, USERS.worker.id, false), denied);
    await assert.rejects(setActive(USERS.ownerB.id, orgA, USERS.worker.id, false), denied);
    // No sirve para desactivar al dueño ni a usuarios ajenos.
    await assert.rejects(setActive(USERS.ownerA.id, orgA, USERS.ownerA.id, false), hasSqlState(SQLSTATE.notWorker));
    await assert.rejects(setActive(USERS.ownerA.id, orgA, USERS.other.id, true), hasSqlState(SQLSTATE.notWorker));
    assert.equal(await canOperate(USERS.worker.id, orgA), true);
  });

  test("nadie cambia is_active directamente", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await assert.rejects(
      runAs(db, USERS.ownerA.id, (tx) =>
        tx.query("update public.organization_members set is_active = false where user_id = $1", [USERS.worker.id]),
      ),
      denied,
    );
  });
});

describe("list_team", () => {
  test("el dueño ve a todos con correo y estado", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await addWorker(USERS.ownerA.id, orgA, USERS.other.email);
    await setActive(USERS.ownerA.id, orgA, USERS.other.id, false);

    const team = await listTeam(USERS.ownerA.id, orgA);
    assert.deepEqual(
      team.map((m) => [m.email, m.role, m.is_active]),
      [
        [USERS.ownerA.email, "owner", true],
        [USERS.worker.email, "barber", true],
        [USERS.other.email, "barber", false],
      ],
    );
  });

  test("el trabajador ve solo a los miembros activos", async () => {
    await addWorker(USERS.ownerA.id, orgA, USERS.worker.email);
    await addWorker(USERS.ownerA.id, orgA, USERS.other.email);
    await setActive(USERS.ownerA.id, orgA, USERS.other.id, false);

    const team = await listTeam(USERS.worker.id, orgA);
    assert.deepEqual(team.map((m) => m.user_id).sort(), [USERS.ownerA.id, USERS.worker.id].sort());
  });

  test("nadie ajeno ve el equipo, aunque conozca el ID", async () => {
    await assert.rejects(listTeam(USERS.ownerB.id, orgA), denied);
    await assert.rejects(listTeam(USERS.other.id, orgA), denied);
    await assert.rejects(listTeam(null, orgA), denied);
  });
});

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

// Etapa 12: red pública, requisitos de listado e historial de slugs.

const USERS = {
  ownerA: { id: "00000000-0000-4000-8000-0000000000d1", email: "a@red.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000d2", email: "b@red.pe" },
  ownerC: { id: "00000000-0000-4000-8000-0000000000d3", email: "c@red.pe" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const invalid = hasSqlState(SQLSTATE.invalidParameterValue);
const duplicate = hasSqlState(SQLSTATE.uniqueViolation);

type Card = {
  slug: string;
  name: string;
  description: string | null;
  district: string | null;
  city: string | null;
  logo_path: string | null;
  hours: Array<{ weekday: number; opens_at: string; closes_at: string }>;
  total_count: number | string;
};

let db: PGlite;
const orgs: Record<string, string> = {};
const shops: Record<string, string> = {};

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function createBusiness(key: keyof typeof USERS, name: string, slug: string): Promise<void> {
  const [{ id }] = await as<{ id: string }>(
    USERS[key].id,
    "select public.create_business($1, 'Av. Principal 123', $2, '2026-10-01') as id",
    [name, slug],
  );
  orgs[slug] = id;
  shops[slug] = (await db.query<{ id: string }>("select id from public.barbershops where organization_id = $1", [id])).rows[0].id;
}

async function addService(owner: keyof typeof USERS, slug: string, name: string, published = true): Promise<string> {
  const [row] = await as<{ id: string }>(
    USERS[owner].id,
    "insert into public.services (organization_id, name, price, is_published) values ($1, $2, '20.00', $3) returning id",
    [orgs[slug], name, published],
  );
  return row.id;
}

async function publish(owner: keyof typeof USERS, slug: string, district: string | null = "Miraflores"): Promise<void> {
  await as(
    USERS[owner].id,
    "update public.barbershops set is_published = true, district = $2, description = 'Cortes y barba' where organization_id = $1",
    [orgs[slug], district],
  );
}

async function list(params: { seed?: string; query?: string; district?: string | null; sort?: string; limit?: number; offset?: number } = {}, userId: string | null = null): Promise<Card[]> {
  return as<Card>(
    userId,
    "select * from public.list_network_barbershops($1, $2, $3, $4, $5, $6)",
    [params.seed ?? "semilla", params.query ?? "", params.district ?? null, params.sort ?? "random", params.limit ?? 24, params.offset ?? 0],
  );
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  // «norte» cumple todo; «sur» tiene un solo servicio publicado; «este» no está publicado.
  await createBusiness("ownerA", "Norte Barber", "norte");
  await addService("ownerA", "norte", "Corte clásico");
  await addService("ownerA", "norte", "Perfilado de barba");
  await publish("ownerA", "norte");
  await as(USERS.ownerA.id, "select public.save_business_hours($1, $2)", [
    shops.norte,
    JSON.stringify([{ weekday: 1, opens_at: "09:00", closes_at: "13:00" }, { weekday: 1, opens_at: "15:00", closes_at: "21:00" }]),
  ]);

  await createBusiness("ownerB", "Sur Estilo", "sur");
  await addService("ownerB", "sur", "Corte");
  await addService("ownerB", "sur", "Tinte", false);
  await publish("ownerB", "sur", "Barranco");

  await createBusiness("ownerC", "Este Studio", "este");
  await addService("ownerC", "este", "Corte");
  await addService("ownerC", "este", "Barba");
});

describe("requisitos de listado", () => {
  test("solo aparecen locales publicados con nombre, dirección y 2 servicios publicados", async () => {
    const cards = await list();
    assert.deepEqual(cards.map((c) => c.slug), ["norte"]);
    assert.deepEqual(cards[0].hours, [
      { weekday: 1, opens_at: "09:00", closes_at: "13:00" },
      { weekday: 1, opens_at: "15:00", closes_at: "21:00" },
    ]);
    assert.equal(Number(cards[0].total_count), 1);
  });

  test("se calcula automáticamente al cambiar servicios, publicación o archivo", async () => {
    const [{ id }] = await as<{ id: string }>(USERS.ownerB.id, "select id from public.services where name = 'Tinte'");
    await as(USERS.ownerB.id, "update public.services set is_published = true where id = $1", [id]);
    assert.deepEqual((await list({ sort: "newest" })).map((c) => c.slug), ["sur", "norte"]);

    await as(USERS.ownerB.id, "update public.services set archived_at = now() where id = $1", [id]);
    assert.deepEqual((await list()).map((c) => c.slug), ["norte"]);

    await publish("ownerC", "este");
    assert.equal((await list()).length, 2);
    await as(USERS.ownerC.id, "update public.barbershops set is_published = false where organization_id = $1", [orgs.este]);
    assert.equal((await list()).length, 1);

    await db.query("update public.organizations set archived_at = now() where id = $1", [orgs.norte]);
    assert.equal((await list()).length, 0);
  });

  test("un servicio no disponible en el local no cuenta", async () => {
    await db.query("update public.service_locations set is_available = false where barbershop_id = $1", [shops.norte]);
    assert.equal((await list()).length, 0);
  });
});

describe("búsqueda, orden y paginación", () => {
  beforeEach(async () => {
    await addService("ownerB", "sur", "Keratina");
    await publish("ownerC", "este", "San Isidro");
  });

  test("busca por nombre, distrito y servicio publicado, sin distinguir mayúsculas", async () => {
    assert.deepEqual((await list({ query: "SUR" })).map((c) => c.slug), ["sur"]);
    assert.deepEqual((await list({ query: "isidro" })).map((c) => c.slug), ["este"]);
    assert.deepEqual((await list({ query: "keratina" })).map((c) => c.slug), ["sur"]);
    // Un servicio no publicado no se encuentra.
    assert.deepEqual((await list({ query: "tinte" })).map((c) => c.slug), []);
    // Los comodines se escapan.
    assert.deepEqual(await list({ query: "%" }), []);
  });

  test("filtra por distrito exacto y lista los distritos con conteo", async () => {
    assert.deepEqual((await list({ district: "  barranco " })).map((c) => c.slug), ["sur"]);
    const districts = await as<{ district: string; barbershop_count: string }>(null, "select * from public.list_network_districts(10)");
    assert.deepEqual(districts.map((d) => d.district).sort(), ["Barranco", "Miraflores", "San Isidro"]);
  });

  test("el orden aleatorio es estable con la misma semilla y no repite al paginar", async () => {
    const full = (await list({ seed: "abc" })).map((c) => c.slug);
    assert.deepEqual((await list({ seed: "abc" })).map((c) => c.slug), full);

    const paged: string[] = [];
    for (let offset = 0; offset < 3; offset += 1) {
      paged.push(...(await list({ seed: "abc", limit: 1, offset })).map((c) => c.slug));
    }
    assert.deepEqual(paged, full);
    assert.equal(new Set(paged).size, 3);

    // Con otra semilla el orden puede cambiar, pero los locales son los mismos.
    assert.deepEqual((await list({ seed: "xyz" })).map((c) => c.slug).sort(), [...full].sort());
  });

  test("rechaza parámetros inválidos", async () => {
    await assert.rejects(list({ limit: 0 }), invalid);
    await assert.rejects(list({ limit: 49 }), invalid);
    await assert.rejects(list({ offset: -1 }), invalid);
    await assert.rejects(list({ sort: "popular" }), invalid);
    await assert.rejects(list({ query: "x".repeat(81) }), invalid);
    await assert.rejects(as(null, "select * from public.list_network_districts(0)"), invalid);
  });

  test("las tarjetas no exponen datos internos ni de contacto", async () => {
    const [card] = await list({ query: "norte" });
    assert.deepEqual(Object.keys(card).sort(), [
      "city", "created_at", "description", "district", "hours", "logo_path", "name", "slug", "total_count",
    ]);
  });
});

describe("historial de slugs", () => {
  async function resolve(slug: string): Promise<string | null> {
    const [row] = await as<{ slug: string | null }>(null, "select public.resolve_barbershop_slug($1) as slug", [slug]);
    return row.slug;
  }

  async function rename(owner: keyof typeof USERS, organization: string, slug: string): Promise<void> {
    await as(USERS[owner].id, "update public.barbershops set slug = $2 where organization_id = $1", [orgs[organization], slug]);
  }

  test("el slug anterior redirige al actual, también tras varios cambios", async () => {
    await rename("ownerA", "norte", "norte-barber");
    assert.equal(await resolve("norte"), "norte-barber");
    await rename("ownerA", "norte", "norte-miraflores");
    assert.equal(await resolve("norte"), "norte-miraflores");
    assert.equal(await resolve("norte-barber"), "norte-miraflores");
    // El slug en uso no es una redirección.
    assert.equal(await resolve("norte-miraflores"), null);
    assert.equal(await resolve("no-existe"), null);
  });

  test("volver al slug anterior lo quita del historial", async () => {
    await rename("ownerA", "norte", "norte-barber");
    await rename("ownerA", "norte", "norte");
    assert.equal(await resolve("norte"), null);
    assert.equal(await resolve("norte-barber"), "norte");
  });

  test("otro local no puede tomar un slug anterior", async () => {
    await rename("ownerA", "norte", "norte-barber");
    await assert.rejects(rename("ownerB", "sur", "norte"), duplicate);
    await assert.rejects(
      as(USERS.ownerC.id, "select public.create_business('Copia', 'Calle 9', 'norte', '2026-10-01')"),
      duplicate,
    );
  });

  test("un local no publicado no redirige", async () => {
    await rename("ownerC", "este", "este-studio");
    assert.equal(await resolve("este"), null);
  });

  test("solo el dueño lee su historial y nadie lo escribe directamente", async () => {
    await rename("ownerA", "norte", "norte-barber");
    assert.equal((await as(USERS.ownerA.id, "select * from public.barbershop_slug_history")).length, 1);
    assert.equal((await as(USERS.ownerB.id, "select * from public.barbershop_slug_history")).length, 0);
    await assert.rejects(as(null, "select * from public.barbershop_slug_history"), denied);
    await assert.rejects(
      as(USERS.ownerB.id, "insert into public.barbershop_slug_history (slug, organization_id, barbershop_id) values ('robo', $1, $2)", [orgs.sur, shops.sur]),
      denied,
    );
    await assert.rejects(as(USERS.ownerA.id, "delete from public.barbershop_slug_history"), denied);
  });
});

describe("coordenadas", () => {
  test("lat/lng son opcionales, con rango y en pareja, y nadie las edita todavía", async () => {
    await assert.rejects(db.query("update public.barbershops set lat = 91, lng = 0"), hasSqlState(SQLSTATE.checkViolation));
    await assert.rejects(db.query("update public.barbershops set lat = -12.1"), hasSqlState(SQLSTATE.checkViolation));
    await db.query("update public.barbershops set lat = -12.121, lng = -77.03 where id = $1", [shops.norte]);
    await assert.rejects(as(USERS.ownerA.id, "update public.barbershops set lat = 0, lng = 0 where id = $1", [shops.norte]), denied);
  });
});

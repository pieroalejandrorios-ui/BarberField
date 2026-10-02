import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { SQLSTATE, createTestDatabase, hasSqlState, runAs } from "./test-database.mts";

const USERS = {
  owner: { id: "00000000-0000-4000-8000-0000000000d1", email: "duena@norte.pe" },
  worker: { id: "00000000-0000-4000-8000-0000000000d2", email: "barbero@norte.pe" },
  ownerB: { id: "00000000-0000-4000-8000-0000000000d3", email: "dueno@sur.pe" },
} as const;

const denied = hasSqlState(SQLSTATE.insufficientPrivilege);
const invalidInput = hasSqlState(SQLSTATE.invalidParameterValue);
const checkViolation = hasSqlState(SQLSTATE.checkViolation);

type PublicBarbershop = {
  name: string;
  slug: string;
  description: string | null;
  hours: Array<{ weekday: number; opens_at: string; closes_at: string }>;
  social_links: Array<{ platform: string; url: string }>;
  photos: Array<{ path: string; caption: string | null }>;
  services: Array<{ name: string; price: string; duration_minutes: number | null }>;
};

let db: PGlite;
let orgA: string;
let shopA: string;
let orgB: string;
let shopB: string;

async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return runAs(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function getPublic(userId: string | null, slug: string): Promise<PublicBarbershop | null> {
  const [row] = await as<{ data: PublicBarbershop | null }>(
    userId,
    "select public.get_public_barbershop($1) as data",
    [slug],
  );
  return row.data;
}

async function saveHours(userId: string, shopId: string, hours: unknown): Promise<void> {
  await as(userId, "select public.save_business_hours($1, $2)", [shopId, JSON.stringify(hours)]);
}

async function saveLinks(userId: string, shopId: string, links: unknown): Promise<void> {
  await as(userId, "select public.save_social_links($1, $2)", [shopId, JSON.stringify(links)]);
}

function mediaPath(organizationId: string, kind: "logo" | "cover" | "gallery", ext = "webp"): string {
  return `${organizationId}/${kind}/${randomUUID()}.${ext}`;
}

async function addPhoto(userId: string, organizationId: string, shopId: string, path: string): Promise<void> {
  await as(
    userId,
    "insert into public.business_photos (organization_id, barbershop_id, storage_path) values ($1, $2, $3)",
    [organizationId, shopId, path],
  );
}

async function uploadObject(userId: string | null, name: string): Promise<void> {
  await as(userId, "insert into storage.objects (bucket_id, name) values ('business-media', $1)", [name]);
}

beforeEach(async () => {
  db = await createTestDatabase();
  for (const user of Object.values(USERS)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [user.id, user.email]);
  }
  [{ id: orgA }] = await as<{ id: string }>(USERS.owner.id, "select public.create_business('Norte', 'Calle 1', 'norte') as id");
  [{ id: orgB }] = await as<{ id: string }>(USERS.ownerB.id, "select public.create_business('Sur', 'Calle 2', 'sur') as id");
  [{ id: shopA }] = await as<{ id: string }>(USERS.owner.id, "select id from public.barbershops where organization_id = $1", [orgA]);
  [{ id: shopB }] = await as<{ id: string }>(USERS.ownerB.id, "select id from public.barbershops where organization_id = $1", [orgB]);
  await as(USERS.owner.id, "select * from public.add_worker_by_email($1, $2)", [orgA, USERS.worker.email]);
});

describe("get_public_barbershop", () => {
  test("un local no publicado o inexistente devuelve null", async () => {
    assert.equal(await getPublic(null, "norte"), null);
    assert.equal(await getPublic(null, "no-existe"), null);
    assert.equal(await getPublic(USERS.owner.id, "norte"), null);
  });

  test("un local publicado devuelve solo datos públicos", async () => {
    await as(USERS.owner.id, `
      insert into public.services (organization_id, name, price, duration_minutes, sort_order, is_published) values
        ($1, 'Corte clásico', 25.50, 30, 1, true),
        ($1, 'Servicio interno', 5, null, 2, false),
        ($1, 'Archivado', 10, null, 3, true)
    `, [orgA]);
    await as(USERS.owner.id, "update public.services set archived_at = now() where name = 'Archivado'");
    await saveHours(USERS.owner.id, shopA, [
      { weekday: 1, opens_at: "15:00", closes_at: "21:00" },
      { weekday: 1, opens_at: "09:00", closes_at: "13:00" },
    ]);
    await saveLinks(USERS.owner.id, shopA, [{ platform: "instagram", url: "https://instagram.com/norte" }]);
    const photo = mediaPath(orgA, "gallery");
    await addPhoto(USERS.owner.id, orgA, shopA, photo);
    await as(USERS.owner.id, "update public.barbershops set is_published = true, description = 'Cortes clásicos' where id = $1", [shopA]);

    const page = await getPublic(null, "norte");
    assert.ok(page);
    assert.equal(page.name, "Norte");
    assert.equal(page.description, "Cortes clásicos");
    assert.deepEqual(page.services, [
      { name: "Corte clásico", description: null, price: "25.50", duration_minutes: 30 },
    ]);
    assert.deepEqual(page.hours, [
      { weekday: 1, opens_at: "09:00", closes_at: "13:00" },
      { weekday: 1, opens_at: "15:00", closes_at: "21:00" },
    ]);
    assert.deepEqual(page.social_links, [{ platform: "instagram", url: "https://instagram.com/norte" }]);
    assert.deepEqual(page.photos, [{ path: photo, caption: null }]);

    // Ninguna clave interna: ni IDs, ni miembros, ni correos. Las rutas de
    // archivos sí llevan el ID del negocio (son URLs públicas del bucket).
    const text = JSON.stringify({ ...page, photos: [], logo_path: null, cover_path: null });
    for (const secret of [orgA, shopA, USERS.owner.id, USERS.worker.email, "Servicio interno", "Archivado"]) {
      assert.equal(text.includes(secret), false, secret);
    }
  });

  test("un negocio archivado deja de ser público", async () => {
    await as(USERS.owner.id, "update public.barbershops set is_published = true where id = $1", [shopA]);
    assert.ok(await getPublic(null, "norte"));
    await db.query("update public.organizations set archived_at = now() where id = $1", [orgA]);
    assert.equal(await getPublic(null, "norte"), null);
  });

  test("un anónimo no lee tablas y solo ejecuta get_public_barbershop", async () => {
    for (const table of [
      "organizations", "barbershops", "organization_members", "barbershop_members",
      "services", "service_locations", "business_hours", "business_social_links", "business_photos",
    ]) {
      await assert.rejects(as(null, `select * from public.${table}`), denied, table);
    }
    const calls = [
      ["select public.create_business('A', 'B', 'abc')", []],
      ["select * from public.add_worker_by_email($1, 'x@y.pe')", [orgA]],
      ["select public.set_worker_active($1, $2, false)", [orgA, USERS.worker.id]],
      ["select * from public.list_team($1)", [orgA]],
      ["select public.reorder_services($1, '{}')", [orgA]],
      ["select public.save_business_hours($1, '[]')", [shopA]],
      ["select public.save_social_links($1, '[]')", [shopA]],
    ] as const;
    for (const [sql, params] of calls) {
      await assert.rejects(as(null, sql, [...params]), denied, sql);
    }
    assert.equal(await getPublic(null, "norte"), null);
  });
});

describe("datos de la página", () => {
  test("solo el dueño edita textos, enlace y publicación", async () => {
    await as(USERS.worker.id, "update public.barbershops set description = 'Trabajador', is_published = true where id = $1", [shopA]);
    await as(USERS.ownerB.id, "update public.barbershops set description = 'Ajeno', is_published = true where id = $1", [shopA]);
    const [shop] = await db.query<{ description: string | null; is_published: boolean }>(
      "select description, is_published from public.barbershops where id = $1",
      [shopA],
    ).then((r) => r.rows);
    assert.deepEqual(shop, { description: null, is_published: false });
  });

  test("se rechaza una URL de mapa que no sea https o de Google Maps", async () => {
    for (const url of ["http://maps.google.com/x", "https://maps.example.com", "javascript:alert(1)"]) {
      await assert.rejects(
        as(USERS.owner.id, "update public.barbershops set maps_url = $1 where id = $2", [url, shopA]),
        checkViolation,
        url,
      );
    }
    await as(USERS.owner.id, "update public.barbershops set maps_url = 'https://maps.app.goo.gl/abc' where id = $1", [shopA]);
  });

  test("logo y portada deben estar en la carpeta de su negocio", async () => {
    await as(USERS.owner.id, "update public.barbershops set logo_path = $1, cover_path = $2 where id = $3", [
      mediaPath(orgA, "logo"), mediaPath(orgA, "cover", "jpg"), shopA,
    ]);
    for (const path of [mediaPath(orgB, "logo"), mediaPath(orgA, "cover"), `${orgA}/logo/x.webp`, `${orgA}/logo/${randomUUID()}.gif`]) {
      await assert.rejects(
        as(USERS.owner.id, "update public.barbershops set logo_path = $1 where id = $2", [path, shopA]),
        checkViolation,
        path,
      );
    }
  });
});

describe("save_business_hours", () => {
  test("reemplaza el horario completo", async () => {
    await saveHours(USERS.owner.id, shopA, [{ weekday: 1, opens_at: "09:00", closes_at: "18:00" }]);
    await saveHours(USERS.owner.id, shopA, [{ weekday: 2, opens_at: "10:00", closes_at: "20:00" }]);
    const rows = await as<{ weekday: number; slot: number }>(USERS.worker.id, "select weekday, slot from public.business_hours");
    assert.deepEqual(rows, [{ weekday: 2, slot: 1 }]);
    await saveHours(USERS.owner.id, shopA, []);
    assert.equal((await as(USERS.owner.id, "select 1 from public.business_hours")).length, 0);
  });

  test("rechaza cierre antes de la apertura, más de 2 rangos, cruces y formatos inválidos", async () => {
    await saveHours(USERS.owner.id, shopA, [{ weekday: 1, opens_at: "09:00", closes_at: "18:00" }]);
    const invalid = [
      [{ weekday: 1, opens_at: "18:00", closes_at: "09:00" }],
      [{ weekday: 1, opens_at: "09:00", closes_at: "09:00" }],
      [
        { weekday: 1, opens_at: "08:00", closes_at: "10:00" },
        { weekday: 1, opens_at: "11:00", closes_at: "13:00" },
        { weekday: 1, opens_at: "15:00", closes_at: "20:00" },
      ],
      [
        { weekday: 3, opens_at: "09:00", closes_at: "14:00" },
        { weekday: 3, opens_at: "13:00", closes_at: "20:00" },
      ],
      [{ weekday: 8, opens_at: "09:00", closes_at: "18:00" }],
      [{ weekday: 1, opens_at: "9:00", closes_at: "18:00" }],
      [{ weekday: "1", opens_at: "09:00", closes_at: "18:00" }],
      { weekday: 1 },
    ];
    for (const hours of invalid) {
      await assert.rejects(saveHours(USERS.owner.id, shopA, hours), invalidInput, JSON.stringify(hours));
    }
    // El horario anterior queda intacto.
    const rows = await as<{ weekday: number }>(USERS.owner.id, "select weekday from public.business_hours");
    assert.deepEqual(rows, [{ weekday: 1 }]);
  });

  test("solo el dueño del local", async () => {
    const hours = [{ weekday: 1, opens_at: "09:00", closes_at: "18:00" }];
    await assert.rejects(saveHours(USERS.worker.id, shopA, hours), denied);
    await assert.rejects(saveHours(USERS.ownerB.id, shopA, hours), denied);
    await assert.rejects(
      as(USERS.owner.id, "insert into public.business_hours (organization_id, barbershop_id, weekday, slot, opens_at, closes_at) values ($1, $2, 1, 1, '09:00', '10:00')", [orgA, shopA]),
      denied,
    );
  });
});

describe("save_social_links", () => {
  test("guarda y reemplaza las redes en orden", async () => {
    await saveLinks(USERS.owner.id, shopA, [
      { platform: "tiktok", url: "https://tiktok.com/@norte" },
      { platform: "website", url: "https://norte.pe" },
    ]);
    await saveLinks(USERS.owner.id, shopA, [{ platform: "facebook", url: "https://facebook.com/norte" }]);
    const rows = await as<{ platform: string }>(USERS.worker.id, "select platform from public.business_social_links");
    assert.deepEqual(rows, [{ platform: "facebook" }]);
  });

  test("rechaza URL que no sea https, plataformas desconocidas o repetidas", async () => {
    const invalid = [
      [{ platform: "instagram", url: "http://instagram.com/norte" }],
      [{ platform: "instagram", url: "instagram.com/norte" }],
      [{ platform: "instagram", url: `https://instagram.com/${"x".repeat(300)}` }],
      [{ platform: "myspace", url: "https://myspace.com/norte" }],
      [
        { platform: "x", url: "https://x.com/a" },
        { platform: "x", url: "https://x.com/b" },
      ],
    ];
    for (const links of invalid) {
      await assert.rejects(saveLinks(USERS.owner.id, shopA, links), invalidInput, JSON.stringify(links));
    }
  });

  test("solo el dueño del local", async () => {
    const links = [{ platform: "x", url: "https://x.com/norte" }];
    await assert.rejects(saveLinks(USERS.worker.id, shopA, links), denied);
    await assert.rejects(saveLinks(USERS.ownerB.id, shopA, links), denied);
  });
});

describe("galería", () => {
  test("se rechaza la foto número 21", async () => {
    for (let i = 0; i < 20; i++) await addPhoto(USERS.owner.id, orgA, shopA, mediaPath(orgA, "gallery"));
    await assert.rejects(
      addPhoto(USERS.owner.id, orgA, shopA, mediaPath(orgA, "gallery")),
      hasSqlState(SQLSTATE.photoLimit),
    );
    // El límite es por local: otro negocio no se ve afectado.
    await addPhoto(USERS.ownerB.id, orgB, shopB, mediaPath(orgB, "gallery"));
  });

  test("solo el dueño agrega, edita y borra fotos de su negocio", async () => {
    const path = mediaPath(orgA, "gallery");
    await assert.rejects(addPhoto(USERS.worker.id, orgA, shopA, mediaPath(orgA, "gallery")), denied);
    await assert.rejects(addPhoto(USERS.ownerB.id, orgA, shopA, mediaPath(orgA, "gallery")), denied);
    // Ni con una ruta de otro negocio.
    await assert.rejects(addPhoto(USERS.owner.id, orgA, shopA, mediaPath(orgB, "gallery")), checkViolation);

    await addPhoto(USERS.owner.id, orgA, shopA, path);
    await as(USERS.worker.id, "update public.business_photos set caption = 'Trabajador'");
    await as(USERS.worker.id, "delete from public.business_photos");
    const [photo] = await as<{ caption: string | null }>(USERS.owner.id, "select caption from public.business_photos");
    assert.deepEqual(photo, { caption: null });

    await assert.rejects(
      as(USERS.owner.id, "update public.business_photos set caption = $1", ["x".repeat(121)]),
      checkViolation,
    );
    await as(USERS.owner.id, "update public.business_photos set caption = 'Nuestro local'");
    await as(USERS.owner.id, "delete from public.business_photos");
    assert.equal((await as(USERS.owner.id, "select 1 from public.business_photos")).length, 0);
  });
});

describe("Storage", () => {
  test("solo el dueño sube y borra archivos en la carpeta de su negocio", async () => {
    const own = mediaPath(orgA, "gallery");
    await uploadObject(USERS.owner.id, own);

    for (const [user, name] of [
      [USERS.worker.id, mediaPath(orgA, "gallery")],
      [USERS.ownerB.id, mediaPath(orgA, "logo")],
      [USERS.owner.id, mediaPath(orgB, "cover")],
      [USERS.owner.id, `${orgA}/otros/${randomUUID()}.webp`],
      [USERS.owner.id, `no-es-uuid/logo/${randomUUID()}.webp`],
      [null, mediaPath(orgA, "logo")],
    ] as const) {
      await assert.rejects(uploadObject(user, name), denied, `${user}:${name}`);
    }

    // Borrar: el trabajador y otro dueño no ven ni borran el archivo.
    await as(USERS.worker.id, "delete from storage.objects");
    await as(USERS.ownerB.id, "delete from storage.objects");
    assert.equal((await db.query("select 1 from storage.objects")).rows.length, 1);

    await as(USERS.owner.id, "delete from storage.objects where name = $1", [own]);
    assert.equal((await db.query("select 1 from storage.objects")).rows.length, 0);
  });

  test("el bucket es público con límites de tamaño y tipo", async () => {
    const [bucket] = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      "select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = 'business-media'",
    ).then((r) => r.rows);
    assert.deepEqual(bucket, {
      public: true,
      file_size_limit: "5242880",
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    });
  });
});

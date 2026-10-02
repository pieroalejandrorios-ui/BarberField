import assert from "node:assert/strict";
import { before, after, describe, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./test-database.mts";

// Etapa 14: revisión global de permisos tras la versión 2. Inspecciona el
// catálogo para que una tabla o función nueva no quede expuesta por descuido.

const ANON_FUNCTIONS = [
  "get_public_barbershop(text)",
  "list_network_barbershops(text,text,text,text,integer,integer)",
  "list_network_districts(integer)",
  "resolve_barbershop_slug(text)",
];

let db: PGlite;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db.close();
});

describe("exposición pública", () => {
  test("RLS está activado en todas las tablas de public", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`,
    );
    assert.deepEqual(rows, []);
  });

  test("un anónimo no tiene ningún privilegio sobre tablas de public", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
         and (has_any_column_privilege('anon', c.oid, 'SELECT')
           or has_any_column_privilege('anon', c.oid, 'INSERT')
           or has_any_column_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE'))
       order by 1`,
    );
    assert.deepEqual(rows, []);
  });

  test("un anónimo solo ejecuta las 4 funciones públicas de página y red", async () => {
    const { rows } = await db.query<{ signature: string }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'EXECUTE')
       order by 1`,
    );
    const normalized = rows.map((r) => r.signature.replace(/p_[a-z_]+ /g, "").replace(/\s+/g, "").replace(/,/g, ","));
    assert.deepEqual(normalized, ANON_FUNCTIONS);
  });

  test("toda función de public es security definer con search_path vacío", async () => {
    const { rows } = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
         and not (p.prosecdef and 'search_path=""' = any(coalesce(p.proconfig, '{}')))
       order by 1`,
    );
    assert.deepEqual(rows, []);
  });

  test("las funciones privadas nuevas no se ejecutan desde la API", async () => {
    for (const fn of [
      "is_pro(uuid)",
      "grant_pro(uuid,text)",
      "terms_version()",
      "owner_terms_version()",
      "assert_worker_owner_limit(uuid,uuid)",
      "barbershop_is_listed(uuid)",
      "verified_email_since()",
    ]) {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select has_function_privilege('authenticated', 'private.${fn}', 'EXECUTE') as allowed`,
      );
      assert.equal(rows[0].allowed, false, fn);
    }
  });

  test("DNI, celulares, clientes y visitas no tienen ninguna vía anónima", async () => {
    for (const table of ["customers", "visits", "visit_items", "profiles", "subscriptions", "rewards", "loyalty_cycles"]) {
      const { rows } = await db.query<{ allowed: boolean }>(
        `select has_any_column_privilege('anon', 'public.${table}', 'SELECT') as allowed`,
      );
      assert.equal(rows[0].allowed, false, table);
    }
  });
});

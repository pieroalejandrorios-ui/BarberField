import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "..", "..", "supabase", "migrations");

// Emula solo lo que Supabase aporta fuera de nuestras migraciones: roles de la
// API, `auth.users`, `auth.uid()` y los privilegios por defecto que Supabase
// concede en `public` (para comprobar que las migraciones los revocan).
const SUPABASE_BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;

  create schema auth;
  create table auth.users (
    id uuid primary key,
    email varchar(255),
    email_confirmed_at timestamptz,
    created_at timestamptz default now(),
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  -- Storage: tablas y helper con la misma forma que en Supabase. Supabase
  -- concede todo en storage.objects y delega el control en RLS.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid,
    created_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1 : array_length(_parts, 1) - 1];
  end
  $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;

  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`;

// `before`: aplica solo las migraciones anteriores a ese archivo, para probar
// la migración de datos existentes con `applyMigrationsFrom`.
export async function createTestDatabase(options: { before?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);

  for (const file of await migrationFiles()) {
    if (options.before && file >= options.before) break;
    await db.exec(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
  }

  return db;
}

export async function applyMigrationsFrom(db: PGlite, from: string): Promise<void> {
  for (const file of await migrationFiles()) {
    if (file >= from) await db.exec(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
}

async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
}

// Ejecuta `fn` como lo haría PostgREST: rol de la API y `sub` del JWT fijados
// solo para la transacción.
export async function runAs<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
      userId ? "authenticated" : "anon",
      userId ?? "",
    ]);
    return fn(tx);
  });
}

export function hasSqlState(code: string) {
  return (error: unknown): boolean =>
    typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export const SQLSTATE = {
  insufficientPrivilege: "42501",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  notNullViolation: "23502",
  uniqueViolation: "23505",
  invalidParameterValue: "22023",
  activeWorker: "PT001",
  accountNotFound: "PT002",
  addingSelf: "PT003",
  ownsBusiness: "PT004",
  worksElsewhere: "PT005",
  alreadyWorker: "PT006",
  notWorker: "PT007",
  photoLimit: "PT008",
  programNotConfigured: "PT009",
  customerArchived: "PT010",
  serviceUnavailable: "PT011",
  idempotencyConflict: "PT012",
  rewardNotEarned: "PT013",
  rewardNotAvailable: "PT014",
  rewardServiceMissing: "PT015",
  termsNotCurrent: "PT019",
  workerOwnerLimit: "PT020",
} as const;

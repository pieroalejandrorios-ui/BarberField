import { readFile, writeFile } from "node:fs/promises";

// El archivo de migración es la fuente de verdad; no mantener copias a mano.
const migration = "supabase/migrations/20260930120000_organizations_barbershops_memberships.sql";
const migrationSql = await readFile(migration, "utf8");
const roleSql = await readFile("supabase/repair-member-role.sql", "utf8");
const sql = migrationSql.replace(
  "create type public.member_role as enum ('owner', 'barber');",
  roleSql,
);
const output = "supabase/setup-stage-1.sql";
await writeFile(output, `-- Ejecutar completo en SQL Editor del proyecto correcto.
-- Solo para la instalación inicial. Si ya existen tablas, verificar primero.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

${sql}

notify pgrst, 'reload schema';
commit;

-- Las cuatro filas deben indicar rls_enabled = true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('organizations', 'barbershops', 'organization_members', 'barbershop_members')
order by c.relname;
`, "utf8");
console.log(`SQL de instalación preparado en ${output}. Todavía no se aplicó a Supabase.`);

// Migraciones posteriores: cada una se aplica completa, en una transacción.
const laterMigrations = [
  {
    migration: "supabase/migrations/20261001220000_network.sql",
    output: "supabase/setup-stage-12-network.sql",
    check: `-- Tres funciones con anonymous_can_execute=true; la tabla con rls_enabled=true.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('resolve_barbershop_slug', 'list_network_barbershops', 'list_network_districts')
order by p.proname;
select relrowsecurity as rls_enabled from pg_class where oid = 'public.barbershop_slug_history'::regclass;`,
  },
  {
    migration: "supabase/migrations/20261001230000_my_visits.sql",
    output: "supabase/setup-stage-13-my-visits.sql",
    check: `-- Dos funciones con anonymous_can_execute=false; linking_enabled=false hasta
-- ejecutar supabase/enable-my-visits.sql.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_my_visits', 'save_my_profile')
order by p.proname;
select private.verified_email_since() is not null as linking_enabled;`,
  },
  {
    migration: "supabase/migrations/20261001210000_workers_multi_owner.sql",
    output: "supabase/setup-stage-11-workers.sql",
    check: `-- one_active_barber_index_exists=false y limit_trigger_exists=true.
select to_regclass('public.organization_members_one_active_barber_idx') is not null as one_active_barber_index_exists,
       exists (
         select 1 from pg_trigger
         where tgname = 'organization_members_worker_owner_limit'
           and tgrelid = 'public.organization_members'::regclass
       ) as limit_trigger_exists;`,
  },
  {
    migration: "supabase/migrations/20261001200000_accounts_pro_terms.sql",
    output: "supabase/setup-stage-10-accounts-pro.sql",
    check: `-- Tres funciones con anonymous_can_execute=false y members_can_execute=true;
-- owners_without_pro debe ser 0.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as members_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('create_business', 'accept_terms', 'get_my_account')
order by p.proname;
select count(distinct m.user_id) as owners_without_pro
from public.organization_members m
where m.role = 'owner'
  and not exists (select 1 from public.subscriptions s where s.user_id = m.user_id);`,
  },
  {
    migration: "supabase/migrations/20261001190000_reports.sql",
    output: "supabase/setup-stage-9-reports.sql",
    check: `-- Ambas funciones: anonymous_can_execute=false, members_can_execute=true,
-- security_definer=true. Cada función rechaza en su interior a quien no sea dueño.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as members_can_execute,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_business_report', 'list_report_visits')
order by p.proname;`,
  },
  {
    migration: "supabase/migrations/20261001180000_visit_corrections.sql",
    output: "supabase/setup-stage-7-visit-corrections.sql",
    check: `-- Ambas funciones: anonymous_can_execute=false, members_can_execute=true.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as members_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('correct_visit', 'void_last_visit')
order by p.proname;`,
  },
  {
    migration: "supabase/migrations/20261001120000_business_creation.sql",
    output: "supabase/setup-stage-1-business.sql",
    check: `-- Debe devolver una fila con create_business y la columna slug.
select p.proname as function_name,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'barbershops' and column_name = 'slug'
       ) as barbershops_has_slug,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_business';`,
  },
  {
    migration: "supabase/migrations/20261001130000_team.sql",
    output: "supabase/setup-stage-2-team.sql",
    check: `-- Debe devolver tres filas, todas con anonymous_can_execute = false.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_worker_by_email', 'set_worker_active', 'list_team')
order by p.proname;`,
  },
  {
    migration: "supabase/migrations/20261001140000_services.sql",
    output: "supabase/setup-stage-3-services.sql",
    check: `-- Deben aparecer services y service_locations con rls_enabled = true y
-- anonymous_can_select = false.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('services', 'service_locations')
order by c.relname;`,
  },
  {
    migration: "supabase/migrations/20261001150000_public_page.sql",
    output: "supabase/setup-stage-4-public-page.sql",
    check: `-- Debe devolver get_public_barbershop con anonymous_can_execute = true y las
-- demás funciones de la etapa con false; y el bucket business-media público.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_public_barbershop', 'save_business_hours', 'save_social_links')
order by p.proname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'business-media';`,
  },
  {
    migration: "supabase/migrations/20261001160000_customers.sql",
    output: "supabase/setup-stage-5-customers.sql",
    check: `-- Debe devolver customers con rls_enabled = true y anonymous_can_select = false,
-- y search_customers con anonymous_can_execute = false.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'customers';

select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'search_customers';`,
  },
  {
    migration: "supabase/migrations/20261001170000_loyalty_visits.sql",
    output: "supabase/setup-stage-6-loyalty-visits.sql",
    check: `-- Deben aparecer las siete tablas con rls_enabled = true y
-- anonymous_can_select = false, y las tres funciones con anonymous_can_execute = false.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('loyalty_programs', 'loyalty_cycles', 'visits', 'visit_items', 'rewards', 'loyalty_events', 'audit_events')
order by c.relname;

select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_loyalty_program', 'register_visit', 'get_customer_loyalty')
order by p.proname;`,
  },
];

for (const { migration: file, output: target, check } of laterMigrations.sort((a, b) => a.migration.localeCompare(b.migration))) {
  const body = await readFile(file, "utf8");
  await writeFile(target, `-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde ${file}; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

${body}

notify pgrst, 'reload schema';
commit;

${check}
`, "utf8");
  console.log(`SQL preparado en ${target}. Todavía no se aplicó a Supabase.`);
}

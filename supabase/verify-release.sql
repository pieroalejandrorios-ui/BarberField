-- Etapa final: diagnóstico administrativo de SOLO LECTURA.
-- Ejecutar completo en SQL Editor. No instala migraciones ni cambia permisos.
-- Se esperan 17 tablas y 16 funciones, todas con ready=true; dos índices y
-- la política de auditoría también deben devolver ready=true.

with expected(table_name, protected_writes) as (values
  ('organizations', false), ('barbershops', false), ('organization_members', true),
  ('barbershop_members', false), ('services', false), ('service_locations', true),
  ('business_hours', true), ('business_social_links', true), ('business_photos', false),
  ('customers', false), ('loyalty_programs', true), ('loyalty_cycles', true),
  ('visits', true), ('visit_items', true), ('rewards', true), ('loyalty_events', true), ('audit_events', true)
)
select e.table_name,
  c.oid is not null as table_exists,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.oid is not null and c.relrowsecurity
    and not has_any_column_privilege('anon', c.oid, 'SELECT')
    and not has_any_column_privilege('anon', c.oid, 'INSERT')
    and not has_any_column_privilege('anon', c.oid, 'UPDATE')
    and not has_table_privilege('anon', c.oid, 'DELETE')
    and has_table_privilege('authenticated', c.oid, 'SELECT')
    and exists (select 1 from pg_policy pol where pol.polrelid = c.oid and pol.polcmd in ('r', '*'))
    and (not e.protected_writes or (
      not has_any_column_privilege('authenticated', c.oid, 'INSERT')
      and not has_any_column_privilege('authenticated', c.oid, 'UPDATE')
      and not has_table_privilege('authenticated', c.oid, 'DELETE'))), false) as ready
from expected e
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name and c.relkind = 'r'
order by e.table_name;

with expected(signature, anonymous_allowed) as (values
  ('public.create_business(text,text,text)', false),
  ('public.add_worker_by_email(uuid,text)', false),
  ('public.set_worker_active(uuid,uuid,boolean)', false),
  ('public.list_team(uuid)', false),
  ('public.reorder_services(uuid,uuid[])', false),
  ('public.save_business_hours(uuid,jsonb)', false),
  ('public.save_social_links(uuid,jsonb)', false),
  ('public.get_public_barbershop(text)', true),
  ('public.search_customers(uuid,text,boolean,integer,integer)', false),
  ('public.save_loyalty_program(uuid,public.reward_type,integer,uuid,numeric,numeric,text,text,public.loyalty_program_status)', false),
  ('public.register_visit(uuid,uuid,jsonb,uuid,boolean,uuid,uuid)', false),
  ('public.get_customer_loyalty(uuid)', false),
  ('public.correct_visit(uuid,jsonb,uuid,text)', false),
  ('public.void_last_visit(uuid,text,uuid)', false),
  ('public.get_business_report(uuid,date,date,uuid)', false),
  ('public.list_report_visits(uuid,date,date,uuid,integer,integer)', false)
)
select e.signature,
  p.oid is not null as function_exists,
  coalesce(p.oid is not null and p.prosecdef
    and 'search_path=""' = any(p.proconfig)
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and has_function_privilege('anon', p.oid, 'EXECUTE') = e.anonymous_allowed, false) as ready
from expected e left join pg_proc p on p.oid = case
  when e.signature like '%public.reward_type%' and
    (to_regtype('public.reward_type') is null or to_regtype('public.loyalty_program_status') is null) then null
  else to_regprocedure(e.signature) end
order by e.signature;

with expected(index_name) as (values ('rewards_live_cycle_idx'), ('loyalty_events_one_reversal_idx'))
select e.index_name, coalesce(i.indisunique and i.indisvalid, false) as ready
from expected e left join pg_index i on i.indexrelid = to_regclass('public.' || e.index_name);

select exists (select 1 from pg_policies
  where schemaname = 'public' and tablename = 'audit_events'
    and policyname = 'audit_events_select_owner'
    and qual = 'private.is_owner(organization_id)') as ready;

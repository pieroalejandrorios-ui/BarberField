-- Comprobación administrativa de solo lectura para el SQL Editor de Supabase.
-- No depende de los permisos de la clave pública.
with expected(table_name) as (
  values ('organizations'), ('barbershops'), ('organization_members'), ('barbershop_members')
)
select e.table_name,
       c.oid is not null as table_exists,
       coalesce(c.relrowsecurity, false) as rls_enabled,
       (select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = e.table_name) as policy_count,
       case when c.oid is not null then has_table_privilege('anon', c.oid, 'SELECT')
            else null end as anonymous_can_select
from expected e
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
                    and c.relkind = 'r'
order by e.table_name;

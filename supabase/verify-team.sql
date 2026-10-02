-- Diagnóstico de equipo. Ejecutar completo en Supabase > SQL Editor.
-- Solo lectura: no crea usuarios ni cambia datos o permisos.
with expected(signature) as (
  values
    ('public.add_worker_by_email(uuid,text)'),
    ('public.set_worker_active(uuid,uuid,boolean)'),
    ('public.list_team(uuid)')
), resolved as (
  select signature, to_regprocedure(signature) as function_id
  from expected
)
select
  r.signature as function_name,
  r.function_id is not null as function_exists,
  coalesce(p.prosecdef, false) as security_definer,
  case when r.function_id is not null
    then has_function_privilege('authenticated', r.function_id, 'EXECUTE')
    else false end as authenticated_can_execute,
  case when r.function_id is not null
    then has_function_privilege('anon', r.function_id, 'EXECUTE')
    else false end as anonymous_can_execute
from resolved r
left join pg_proc p on p.oid = r.function_id
order by r.signature;

-- Las seis filas deben indicar function_exists = true.
select signature as helper_function,
       to_regprocedure(signature) is not null as function_exists
from (values
  ('private.is_owner(uuid)'),
  ('private.is_active_member(uuid)'),
  ('private.lock_user_memberships(uuid)'),
  ('private.assert_can_work_at(uuid,uuid)'),
  ('private.assign_worker_to_barbershops(uuid,uuid)'),
  ('private.ensure_active_owner()')
) as expected(signature)
order by signature;

-- Ambos deben ser true. No conceder acceso al esquema privado a anon.
select
  has_schema_privilege('authenticated', 'public', 'USAGE') as public_schema_access,
  case when to_regnamespace('private') is not null
    then has_schema_privilege('authenticated', 'private', 'USAGE')
    else false end as private_schema_access;

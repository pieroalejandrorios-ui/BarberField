-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde supabase/migrations/20261001130000_team.sql; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 2: equipo. El dueño agrega trabajadores por correo, los desactiva y
-- los reactiva solo mediante funciones que validan las reglas de membresía.
--
-- Errores (la app los traduce al español):
--   42501 sin sesión o sin permiso
--   22023 datos inválidos
--   PT002 no hay una cuenta con ese correo
--   PT003 el dueño intenta agregarse a sí mismo
--   PT004 el usuario es dueño de un negocio activo
--   PT005 el usuario es trabajador activo de otro negocio
--   PT006 el usuario ya es trabajador activo de este negocio
--   PT007 el usuario no es trabajador de este negocio

-- ---------------------------------------------------------------------------
-- Sin UPDATE directo de membresías: activar y desactivar pasa por funciones.
-- ---------------------------------------------------------------------------

revoke update on table public.organization_members from authenticated;
drop policy organization_members_update_owner on public.organization_members;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

-- Misma clave que `create_business`: serializa los cambios de membresía de un
-- usuario para que dos operaciones simultáneas no rompan las reglas.
create function private.lock_user_memberships(p_user_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('membership:' || p_user_id::text, 0));
$$;

-- Valida que el usuario pueda ser trabajador activo de `p_organization_id`.
create function private.assert_can_work_at(p_user_id uuid, p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user_id
      and m.role = 'owner'
      and m.is_active
      and o.archived_at is null
  ) then
    raise exception 'user owns an active business' using errcode = 'PT004';
  end if;

  -- Incluye negocios archivados: el índice único también los cuenta.
  if exists (
    select 1
    from public.organization_members m
    where m.user_id = p_user_id
      and m.organization_id <> p_organization_id
      and m.role = 'barber'
      and m.is_active
  ) then
    raise exception 'user works at another business' using errcode = 'PT005';
  end if;
end;
$$;

-- En la v1 cada negocio tiene un solo local; se asignan todos los activos.
create function private.assign_worker_to_barbershops(p_organization_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.barbershop_members (organization_id, barbershop_id, user_id)
  select b.organization_id, b.id, p_user_id
  from public.barbershops b
  where b.organization_id = p_organization_id
    and b.archived_at is null
  on conflict do nothing;
$$;

revoke all on function private.lock_user_memberships(uuid) from public, anon, authenticated;
revoke all on function private.assert_can_work_at(uuid, uuid) from public, anon, authenticated;
revoke all on function private.assign_worker_to_barbershops(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- add_worker_by_email
-- ---------------------------------------------------------------------------

create function public.add_worker_by_email(p_organization_id uuid, p_email text)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_user_email text;
  v_role public.member_role;
  v_is_active boolean;
begin
  if not private.is_owner(p_organization_id) then
    raise exception 'only the owner can add workers' using errcode = 'insufficient_privilege';
  end if;

  if char_length(v_email) not between 3 and 254 or position('@' in v_email) = 0 then
    raise exception 'invalid email' using errcode = 'invalid_parameter_value';
  end if;

  select u.id, u.email::text
  into v_user_id, v_user_email
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception 'account not found' using errcode = 'PT002';
  end if;

  if v_user_id = (select auth.uid()) then
    raise exception 'owner cannot add themselves' using errcode = 'PT003';
  end if;

  perform private.lock_user_memberships(v_user_id);

  select m.role, m.is_active
  into v_role, v_is_active
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = v_user_id;

  if v_role = 'owner' then
    raise exception 'user is an owner of this business' using errcode = 'PT004';
  end if;

  if v_role = 'barber' and v_is_active then
    raise exception 'already a worker of this business' using errcode = 'PT006';
  end if;

  perform private.assert_can_work_at(v_user_id, p_organization_id);

  if v_role is null then
    insert into public.organization_members (organization_id, user_id, role)
    values (p_organization_id, v_user_id, 'barber');
  else
    -- Trabajador desactivado del mismo negocio: se reactiva.
    update public.organization_members m
    set is_active = true
    where m.organization_id = p_organization_id
      and m.user_id = v_user_id;
  end if;

  perform private.assign_worker_to_barbershops(p_organization_id, v_user_id);

  return query select v_user_id, v_user_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_worker_active
-- ---------------------------------------------------------------------------

create function public.set_worker_active(p_organization_id uuid, p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_owner(p_organization_id) then
    raise exception 'only the owner can change workers' using errcode = 'insufficient_privilege';
  end if;

  if p_active is null then
    raise exception 'invalid state' using errcode = 'invalid_parameter_value';
  end if;

  perform private.lock_user_memberships(p_user_id);

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role = 'barber'
  ) then
    raise exception 'not a worker of this business' using errcode = 'PT007';
  end if;

  if p_active then
    perform private.assert_can_work_at(p_user_id, p_organization_id);
    perform private.assign_worker_to_barbershops(p_organization_id, p_user_id);
  end if;

  update public.organization_members m
  set is_active = p_active
  where m.organization_id = p_organization_id
    and m.user_id = p_user_id
    and m.is_active is distinct from p_active;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_team
--
-- El dueño ve a todos los miembros, con su estado. El trabajador ve solo a los
-- miembros activos (para el selector «Atendido por»). No expone otros datos de
-- auth.users.
-- ---------------------------------------------------------------------------

create function public.list_team(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  role public.member_role,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean := private.is_owner(p_organization_id);
begin
  if not private.is_active_member(p_organization_id) then
    raise exception 'not a member of this business' using errcode = 'insufficient_privilege';
  end if;

  return query
  select m.user_id, u.email::text, m.role, m.is_active, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
    and (v_is_owner or m.is_active)
  order by m.role, m.is_active desc, u.email;
end;
$$;

revoke all on function public.add_worker_by_email(uuid, text) from public, anon;
revoke all on function public.set_worker_active(uuid, uuid, boolean) from public, anon;
revoke all on function public.list_team(uuid) from public, anon;
grant execute on function public.add_worker_by_email(uuid, text) to authenticated;
grant execute on function public.set_worker_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_team(uuid) to authenticated;


notify pgrst, 'reload schema';
commit;

-- Debe devolver tres filas, todas con anonymous_can_execute = false.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_worker_by_email', 'set_worker_active', 'list_team')
order by p.proname;

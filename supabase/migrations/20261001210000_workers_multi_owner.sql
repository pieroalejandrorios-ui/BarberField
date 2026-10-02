-- Etapa 11 (versión 2): trabajadores para hasta 3 dueños distintos.
--
-- - Se elimina «un trabajador activo pertenece a un solo negocio» (índice
--   único) y «un trabajador activo no crea negocios» (PT001).
-- - Un dueño Pro puede ser trabajador de otros dueños (ya no se usa PT004 para
--   dueños de otros negocios; sigue para el dueño de este mismo negocio).
-- - Límite: membresías activas de trabajador en negocios de como máximo 3
--   dueños distintos. Dos negocios del mismo dueño cuentan como uno. Lo
--   valida un trigger en `organization_members` (también para escrituras de
--   funciones) y, antes, las funciones del equipo para dar el mismo error.
--
-- Errores (la app los traduce al español):
--   PT020 el trabajador ya trabaja para 3 dueños distintos

-- ---------------------------------------------------------------------------
-- Regla de un solo negocio
-- ---------------------------------------------------------------------------

drop index public.organization_members_one_active_barber_idx;

-- ---------------------------------------------------------------------------
-- Límite de dueños
--
-- Cuenta los dueños activos de los negocios donde el usuario es trabajador
-- activo, más los de `p_organization_id`. Incluye negocios archivados, igual
-- que el índice anterior, para que desarchivar no supere el límite. Quien
-- llama debe haber tomado `private.lock_user_memberships(p_user_id)`.
-- ---------------------------------------------------------------------------

create function private.assert_worker_owner_limit(p_user_id uuid, p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_count integer;
begin
  select count(distinct o.user_id)
  into v_owner_count
  from public.organization_members o
  where o.role = 'owner'
    and o.is_active
    and o.user_id <> p_user_id
    and (
      o.organization_id = p_organization_id
      or o.organization_id in (
        select w.organization_id
        from public.organization_members w
        where w.user_id = p_user_id
          and w.role = 'barber'
          and w.is_active
      )
    );

  if v_owner_count > 3 then
    raise exception 'worker already works for 3 owners' using errcode = 'PT020';
  end if;
end;
$$;

revoke all on function private.assert_worker_owner_limit(uuid, uuid) from public, anon, authenticated;

-- Misma firma: las funciones del equipo la siguen llamando.
create or replace function private.assert_can_work_at(p_user_id uuid, p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_worker_owner_limit(p_user_id, p_organization_id);
end;
$$;

-- Solo al pasar a trabajador activo (alta, reactivación o cambio de rol).
create function private.enforce_worker_owner_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'barber' and new.is_active
     and (tg_op = 'INSERT' or not (old.role = 'barber' and old.is_active)) then
    perform private.lock_user_memberships(new.user_id);
    perform private.assert_worker_owner_limit(new.user_id, new.organization_id);
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_worker_owner_limit() from public, anon, authenticated;

create trigger organization_members_worker_owner_limit
  before insert or update of role, is_active on public.organization_members
  for each row execute function private.enforce_worker_owner_limit();

-- ---------------------------------------------------------------------------
-- create_business: igual que en la etapa 10, sin la regla PT001.
-- ---------------------------------------------------------------------------

create or replace function public.create_business(
  p_name text,
  p_address text,
  p_slug text,
  p_owner_terms_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_address text := btrim(coalesce(p_address, ''));
  v_slug text := btrim(coalesce(p_slug, ''));
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_owner_terms_version is distinct from private.owner_terms_version() then
    raise exception 'owner terms not accepted' using errcode = 'PT019';
  end if;

  if char_length(v_name) not between 1 and 120 then
    raise exception 'invalid business name'
      using errcode = 'invalid_parameter_value';
  end if;

  if char_length(v_address) not between 1 and 200 then
    raise exception 'invalid address'
      using errcode = 'invalid_parameter_value';
  end if;

  if char_length(v_slug) not between 3 and 60
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid slug'
      using errcode = 'invalid_parameter_value';
  end if;

  perform private.lock_user_memberships(v_user_id);
  perform private.grant_pro(v_user_id, p_owner_terms_version);

  insert into public.organizations (name, created_by)
  values (v_name, v_user_id)
  returning id into v_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_organization_id, v_user_id, 'owner');

  insert into public.barbershops (organization_id, name, address, slug)
  values (v_organization_id, v_name, v_address, v_slug);

  return v_organization_id;
end;
$$;

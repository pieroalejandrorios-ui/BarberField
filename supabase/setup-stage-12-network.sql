-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde supabase/migrations/20261001220000_network.sql; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 12 (versión 2): red pública de barberías y URLs propias.
--
-- - `barbershops.lat`/`lng` opcionales para un futuro «cerca de ti» (sin uso,
--   sin permiso de escritura todavía).
-- - `barbershop_slug_history`: slugs anteriores de cada local. Un trigger los
--   guarda al cambiar el slug; `resolve_barbershop_slug` devuelve el actual
--   para redirigir. Un slug en uso siempre tiene prioridad sobre el historial.
-- - `private.barbershop_is_listed`: requisitos de la red, calculados (nunca
--   marcados a mano): publicado, no archivado, nombre, dirección y al menos 2
--   servicios publicados, no archivados y disponibles en el local.
-- - RPC anónimas `list_network_barbershops` y `list_network_districts`: solo
--   datos de tarjeta de locales que cumplen los requisitos.
--
-- Errores:
--   22023 parámetros inválidos

-- ---------------------------------------------------------------------------
-- Coordenadas
-- ---------------------------------------------------------------------------

alter table public.barbershops
  add column lat numeric(9,6),
  add column lng numeric(9,6),
  add constraint barbershops_lat_range check (lat is null or lat between -90 and 90),
  add constraint barbershops_lng_range check (lng is null or lng between -180 and 180),
  add constraint barbershops_coordinates_pair check ((lat is null) = (lng is null));

-- ---------------------------------------------------------------------------
-- Historial de slugs
-- ---------------------------------------------------------------------------

create table public.barbershop_slug_history (
  slug text primary key,
  organization_id uuid not null,
  barbershop_id uuid not null,
  created_at timestamptz not null default now(),
  constraint barbershop_slug_history_slug_format
    check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint barbershop_slug_history_barbershop_fkey
    foreign key (organization_id, barbershop_id)
    references public.barbershops (organization_id, id) on delete cascade
);

create index barbershop_slug_history_barbershop_idx
  on public.barbershop_slug_history (organization_id, barbershop_id);

create function private.record_slug_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.slug is not null and old.slug is distinct from new.slug then
    insert into public.barbershop_slug_history (slug, organization_id, barbershop_id)
    values (old.slug, old.organization_id, old.id)
    on conflict (slug) do update
      set organization_id = excluded.organization_id,
          barbershop_id = excluded.barbershop_id,
          created_at = now();
  end if;

  -- El slug nuevo está en uso: deja de ser una redirección.
  if new.slug is not null then
    delete from public.barbershop_slug_history h where h.slug = new.slug;
  end if;

  return new;
end;
$$;

revoke all on function private.record_slug_history() from public, anon, authenticated;

create trigger barbershops_record_slug_history
  after update of slug on public.barbershops
  for each row execute function private.record_slug_history();

-- Un slug anterior queda reservado para su local: otro local no puede tomarlo
-- y apropiarse de los enlaces ya compartidos. Mismo error que un slug en uso.
create function private.reserve_slug_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is not null and exists (
    select 1
    from public.barbershop_slug_history h
    where h.slug = new.slug
      and h.barbershop_id <> new.id
  ) then
    raise exception 'slug reserved by another barbershop'
      using errcode = 'unique_violation', constraint = 'barbershops_slug_key';
  end if;
  return new;
end;
$$;

revoke all on function private.reserve_slug_history() from public, anon, authenticated;

create trigger barbershops_reserve_slug_history
  before insert or update of slug on public.barbershops
  for each row execute function private.reserve_slug_history();

revoke all on table public.barbershop_slug_history from public, anon, authenticated;
grant select on table public.barbershop_slug_history to authenticated;
alter table public.barbershop_slug_history enable row level security;

create policy barbershop_slug_history_select_owner
  on public.barbershop_slug_history for select to authenticated
  using (private.is_owner(organization_id));

-- Slug actual de un local publicado a partir de uno anterior, o null.
create function public.resolve_barbershop_slug(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.slug
  from public.barbershop_slug_history h
  join public.barbershops b
    on b.organization_id = h.organization_id
   and b.id = h.barbershop_id
  join public.organizations o on o.id = b.organization_id
  where h.slug = p_slug
    and b.slug is not null
    and b.slug <> p_slug
    and b.is_published
    and b.archived_at is null
    and o.archived_at is null
    and not exists (select 1 from public.barbershops x where x.slug = p_slug);
$$;

-- ---------------------------------------------------------------------------
-- Requisitos de la red
-- ---------------------------------------------------------------------------

create function private.barbershop_is_listed(p_barbershop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barbershops b
    join public.organizations o on o.id = b.organization_id
    where b.id = p_barbershop_id
      and b.is_published
      and b.archived_at is null
      and o.archived_at is null
      and b.slug is not null
      and char_length(btrim(b.name)) > 0
      and char_length(btrim(coalesce(b.address, ''))) > 0
      and (
        select count(*)
        from public.services s
        join public.service_locations sl
          on sl.organization_id = s.organization_id
         and sl.service_id = s.id
         and sl.barbershop_id = b.id
         and sl.is_available
        where s.organization_id = b.organization_id
          and s.is_published
          and s.archived_at is null
      ) >= 2
  );
$$;

revoke all on function private.barbershop_is_listed(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_network_barbershops
--
-- `p_sort`: `random` (estable para la misma `p_seed`, para no repetir locales
-- al paginar) o `newest`. `p_query` busca por nombre, distrito o servicio
-- publicado (contiene, sin distinguir mayúsculas). `p_district` filtra por
-- distrito exacto (sin distinguir mayúsculas). Solo datos de la tarjeta.
-- ---------------------------------------------------------------------------

create function public.list_network_barbershops(
  p_seed text default '',
  p_query text default '',
  p_district text default null,
  p_sort text default 'random',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  slug text,
  name text,
  description text,
  district text,
  city text,
  logo_path text,
  hours jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seed text := coalesce(p_seed, '');
  v_query text := btrim(coalesce(p_query, ''));
  v_district text := lower(btrim(coalesce(p_district, '')));
  v_pattern text;
begin
  if p_limit is null or p_limit not between 1 and 48
     or p_offset is null or p_offset not between 0 and 10000
     or char_length(v_seed) > 64
     or char_length(v_query) > 80
     or char_length(v_district) > 80
     or p_sort is null or p_sort not in ('random', 'newest') then
    raise exception 'invalid parameters' using errcode = 'invalid_parameter_value';
  end if;

  v_pattern := '%' || replace(replace(replace(lower(v_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    b.slug,
    b.name,
    left(b.description, 300),
    b.district,
    b.city,
    b.logo_path,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'weekday', h.weekday,
               'opens_at', to_char(h.opens_at, 'HH24:MI'),
               'closes_at', to_char(h.closes_at, 'HH24:MI'))
             order by h.weekday, h.slot)
      from public.business_hours h
      where h.barbershop_id = b.id
    ), '[]'::jsonb),
    b.created_at,
    count(*) over ()
  from public.barbershops b
  where private.barbershop_is_listed(b.id)
    and (v_district = '' or lower(btrim(b.district)) = v_district)
    and (
      v_query = ''
      or lower(b.name) like v_pattern
      or lower(coalesce(b.district, '')) like v_pattern
      or exists (
        select 1
        from public.services s
        join public.service_locations sl
          on sl.organization_id = s.organization_id
         and sl.service_id = s.id
         and sl.barbershop_id = b.id
         and sl.is_available
        where s.organization_id = b.organization_id
          and s.is_published
          and s.archived_at is null
          and lower(s.name) like v_pattern
      )
    )
  order by
    case when p_sort = 'newest' then b.created_at end desc,
    case when p_sort = 'random' then md5(b.id::text || v_seed) end,
    b.id
  limit p_limit
  offset p_offset;
end;
$$;

-- Distritos con locales en la red, de más a menos locales.
create function public.list_network_districts(p_limit integer default 6)
returns table (district text, barbershop_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'invalid parameters' using errcode = 'invalid_parameter_value';
  end if;

  return query
  select min(btrim(b.district)), count(*)
  from public.barbershops b
  where private.barbershop_is_listed(b.id)
    and char_length(btrim(coalesce(b.district, ''))) > 0
  group by lower(btrim(b.district))
  order by count(*) desc, min(btrim(b.district))
  limit p_limit;
end;
$$;

revoke all on function public.resolve_barbershop_slug(text) from public;
revoke all on function public.list_network_barbershops(text, text, text, text, integer, integer) from public;
revoke all on function public.list_network_districts(integer) from public;
grant execute on function public.resolve_barbershop_slug(text) to anon, authenticated;
grant execute on function public.list_network_barbershops(text, text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.list_network_districts(integer) to anon, authenticated;


notify pgrst, 'reload schema';
commit;

-- Tres funciones con anonymous_can_execute=true; la tabla con rls_enabled=true.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('resolve_barbershop_slug', 'list_network_barbershops', 'list_network_districts')
order by p.proname;
select relrowsecurity as rls_enabled from pg_class where oid = 'public.barbershop_slug_history'::regclass;

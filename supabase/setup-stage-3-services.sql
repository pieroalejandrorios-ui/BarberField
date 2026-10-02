-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde supabase/migrations/20261001140000_services.sql; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 3: servicios y precios.
--
-- - `services`: catálogo del negocio. El dueño crea, edita, reordena y archiva;
--   los miembros activos solo consultan. No se borran (las visitas guardarán
--   una copia del nombre y del precio).
-- - `service_locations`: disponibilidad por local. Se mantiene con triggers;
--   la interfaz de la v1 no la expone.
-- - `public.reorder_services`: cambia el orden de presentación de forma atómica.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  name text not null,
  description text,
  price numeric(10,2) not null,
  duration_minutes integer,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint services_name_length
    check (char_length(btrim(name)) between 1 and 80),
  constraint services_description_length
    check (description is null or char_length(description) <= 300),
  constraint services_price_non_negative check (price >= 0),
  constraint services_duration_range
    check (duration_minutes is null or duration_minutes between 1 and 1440),
  -- Destino de claves foráneas compuestas (visitas, premios, disponibilidad).
  constraint services_organization_id_id_key unique (organization_id, id)
);

create index services_organization_sort_idx
  on public.services (organization_id, sort_order);

create table public.service_locations (
  organization_id uuid not null,
  service_id uuid not null,
  barbershop_id uuid not null,
  is_available boolean not null default true,
  primary key (organization_id, service_id, barbershop_id),
  constraint service_locations_service_fkey
    foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete restrict,
  constraint service_locations_barbershop_fkey
    foreign key (organization_id, barbershop_id)
    references public.barbershops (organization_id, id) on delete restrict
);

create index service_locations_barbershop_idx
  on public.service_locations (barbershop_id);

create trigger services_touch_updated_at
  before update on public.services
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Disponibilidad automática: un servicio nuevo queda disponible en los locales
-- activos del negocio, y un local nuevo ofrece los servicios activos.
-- ---------------------------------------------------------------------------

create function private.add_service_locations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_locations (organization_id, service_id, barbershop_id)
  select new.organization_id, new.id, b.id
  from public.barbershops b
  where b.organization_id = new.organization_id
    and b.archived_at is null
  on conflict do nothing;
  return null;
end;
$$;

create function private.add_barbershop_services()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.service_locations (organization_id, service_id, barbershop_id)
  select new.organization_id, s.id, new.id
  from public.services s
  where s.organization_id = new.organization_id
    and s.archived_at is null
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function private.add_service_locations() from public, anon, authenticated;
revoke all on function private.add_barbershop_services() from public, anon, authenticated;

create trigger services_add_locations
  after insert on public.services
  for each row execute function private.add_service_locations();

create trigger barbershops_add_services
  after insert on public.barbershops
  for each row execute function private.add_barbershop_services();

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

revoke all on table public.services, public.service_locations
from public, anon, authenticated;

grant select on table public.services, public.service_locations to authenticated;

grant insert (organization_id, name, description, price, duration_minutes, is_published, sort_order),
      update (name, description, price, duration_minutes, is_published, sort_order, archived_at)
  on table public.services to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.service_locations enable row level security;

create policy services_select_member
  on public.services for select to authenticated
  using (private.is_active_member(organization_id));

create policy services_insert_owner
  on public.services for insert to authenticated
  with check (private.is_owner(organization_id));

create policy services_update_owner
  on public.services for update to authenticated
  using (private.is_owner(organization_id))
  with check (private.is_owner(organization_id));

create policy service_locations_select_member
  on public.service_locations for select to authenticated
  using (private.is_active_member(organization_id));

-- ---------------------------------------------------------------------------
-- reorder_services: asigna `sort_order` = posición en `p_service_ids`.
--
-- Errores: 42501 no es el dueño; 22023 lista vacía, con repetidos o con
-- servicios de otro negocio.
-- ---------------------------------------------------------------------------

create function public.reorder_services(p_organization_id uuid, p_service_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := coalesce(cardinality(p_service_ids), 0);
  v_updated integer;
begin
  if not private.is_owner(p_organization_id) then
    raise exception 'only the owner can reorder services' using errcode = 'insufficient_privilege';
  end if;

  if v_count = 0
     or v_count <> (select count(distinct id) from unnest(p_service_ids) as t(id)) then
    raise exception 'invalid service list' using errcode = 'invalid_parameter_value';
  end if;

  update public.services s
  set sort_order = t.position
  from unnest(p_service_ids) with ordinality as t(id, position)
  where s.id = t.id
    and s.organization_id = p_organization_id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_count then
    raise exception 'service not found in this business' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

revoke all on function public.reorder_services(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_services(uuid, uuid[]) to authenticated;


notify pgrst, 'reload schema';
commit;

-- Deben aparecer services y service_locations con rls_enabled = true y
-- anonymous_can_select = false.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('services', 'service_locations')
order by c.relname;

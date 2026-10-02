-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde supabase/migrations/20261001120000_business_creation.sql; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 1: alta atómica de negocios y datos del local para la página pública.
--
-- - `organizations`: `updated_at` y `created_by`.
-- - `barbershops`: slug y datos públicos (se editan en la etapa 4).
-- - `organization_members`: sin INSERT directo ni cambio de rol; las altas se
--   hacen solo mediante funciones. Un trabajador activo pertenece a un solo
--   negocio.
-- - `public.create_business`: crea negocio, membresía de dueño y local en una
--   sola transacción.

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references auth.users (id) on delete restrict;

create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- barbershops
--
-- `slug` admite nulos solo por compatibilidad con filas previas; la función de
-- alta siempre lo asigna. El índice único de Postgres ignora los nulos.
-- ---------------------------------------------------------------------------

alter table public.barbershops
  add column updated_at timestamptz not null default now(),
  add column slug text,
  add column description text,
  add column district text,
  add column city text,
  add column maps_url text,
  add column phone text,
  add column hours_note text,
  add column logo_path text,
  add column cover_path text,
  add column is_published boolean not null default false,
  add constraint barbershops_slug_key unique (slug),
  add constraint barbershops_slug_format
    check (slug is null or (
      char_length(slug) between 3 and 60
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )),
  add constraint barbershops_description_length
    check (description is null or char_length(description) <= 1000),
  add constraint barbershops_district_length
    check (district is null or char_length(btrim(district)) between 1 and 80),
  add constraint barbershops_city_length
    check (city is null or char_length(btrim(city)) between 1 and 80),
  add constraint barbershops_maps_url_format
    check (maps_url is null or (
      char_length(maps_url) <= 500
      and maps_url ~ '^https://((www\.)?google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)([/?#].*)?$'
    )),
  -- Celular `+519XXXXXXXX` o teléfono fijo peruano con código de área.
  add constraint barbershops_phone_format
    check (phone is null or phone ~ '^\+51(9[0-9]{8}|[1-8][0-9]{6,7})$'),
  add constraint barbershops_hours_note_length
    check (hours_note is null or char_length(hours_note) <= 200),
  add constraint barbershops_logo_path_length
    check (logo_path is null or char_length(logo_path) between 1 and 300),
  add constraint barbershops_cover_path_length
    check (cover_path is null or char_length(cover_path) between 1 and 300);

create trigger barbershops_touch_updated_at
  before update on public.barbershops
  for each row execute function private.touch_updated_at();

grant update (
  slug, description, district, city, maps_url, phone, hours_note,
  logo_path, cover_path, is_published
) on table public.barbershops to authenticated;

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------

revoke insert on table public.organization_members from authenticated;
revoke update (role) on table public.organization_members from authenticated;
drop policy organization_members_insert_owner on public.organization_members;

-- Un trabajador activo pertenece a un solo negocio. La regla «un trabajador
-- activo no es dueño de otro negocio» se valida en las funciones.
create unique index organization_members_one_active_barber_idx
  on public.organization_members (user_id)
  where role = 'barber' and is_active;

-- ---------------------------------------------------------------------------
-- Alta de negocio
--
-- Errores (la app los traduce al español):
--   42501 sin sesión
--   22023 datos inválidos
--   23505 slug en uso (restricción barbershops_slug_key)
--   PT001 el usuario es trabajador activo de un negocio
-- ---------------------------------------------------------------------------

create function public.create_business(p_name text, p_address text, p_slug text)
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

  -- Serializa los cambios de membresía de este usuario (alta de negocio y,
  -- en la etapa 2, alta como trabajador) para que no se crucen.
  perform pg_advisory_xact_lock(hashtextextended('membership:' || v_user_id::text, 0));

  if exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = v_user_id
      and m.role = 'barber'
      and m.is_active
      and o.archived_at is null
  ) then
    raise exception 'active workers cannot create a business'
      using errcode = 'PT001';
  end if;

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

revoke all on function public.create_business(text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text) to authenticated;


notify pgrst, 'reload schema';
commit;

-- Debe devolver una fila con create_business y la columna slug.
select p.proname as function_name,
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'barbershops' and column_name = 'slug'
       ) as barbershops_has_slug,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_business';

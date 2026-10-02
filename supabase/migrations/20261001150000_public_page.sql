-- Etapa 4: página pública.
--
-- - `business_hours`, `business_social_links`, `business_photos`.
-- - Bucket `business-media` (lectura pública) y políticas de Storage: solo el
--   dueño escribe en la carpeta de su negocio.
-- - `save_business_hours` y `save_social_links` reemplazan el conjunto completo
--   en una transacción.
-- - `get_public_barbershop`: única función concedida a `anon`.
--
-- Errores (la app los traduce al español):
--   42501 no es el dueño
--   22023 datos inválidos (horario, redes)
--   PT008 el local ya tiene 20 fotos

-- ---------------------------------------------------------------------------
-- Rutas de archivos: `{organization_id}/{logo|cover|gallery}/{uuid}.{ext}`
-- ---------------------------------------------------------------------------

create function private.is_business_media_path(p_organization_id uuid, p_kind text, p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path ~ (
    '^' || p_organization_id::text || '/' || p_kind
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'
  );
$$;

revoke all on function private.is_business_media_path(uuid, text, text) from public, anon;
grant execute on function private.is_business_media_path(uuid, text, text) to authenticated;

alter table public.barbershops
  add constraint barbershops_logo_path_format
    check (logo_path is null or private.is_business_media_path(organization_id, 'logo', logo_path)),
  add constraint barbershops_cover_path_format
    check (cover_path is null or private.is_business_media_path(organization_id, 'cover', cover_path));

-- ---------------------------------------------------------------------------
-- Horario
-- ---------------------------------------------------------------------------

create table public.business_hours (
  organization_id uuid not null,
  barbershop_id uuid not null,
  weekday smallint not null,
  slot smallint not null,
  opens_at time not null,
  closes_at time not null,
  primary key (barbershop_id, weekday, slot),
  constraint business_hours_barbershop_fkey
    foreign key (organization_id, barbershop_id)
    references public.barbershops (organization_id, id) on delete restrict,
  constraint business_hours_weekday_range check (weekday between 1 and 7),
  constraint business_hours_slot_range check (slot between 1 and 2),
  constraint business_hours_order check (closes_at > opens_at)
);

create index business_hours_organization_idx on public.business_hours (organization_id);

-- ---------------------------------------------------------------------------
-- Redes sociales
-- ---------------------------------------------------------------------------

create type public.social_platform as enum ('instagram', 'facebook', 'tiktok', 'youtube', 'x', 'website');

create table public.business_social_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  barbershop_id uuid not null,
  platform public.social_platform not null,
  url text not null,
  sort_order integer not null default 0,
  constraint business_social_links_barbershop_fkey
    foreign key (organization_id, barbershop_id)
    references public.barbershops (organization_id, id) on delete restrict,
  constraint business_social_links_platform_key unique (barbershop_id, platform),
  constraint business_social_links_url_format
    check (char_length(url) <= 300 and url ~ '^https://[^\s/?#]+\.[^\s/?#]+([/?#]\S*)?$')
);

create index business_social_links_organization_idx on public.business_social_links (organization_id);

-- ---------------------------------------------------------------------------
-- Galería
-- ---------------------------------------------------------------------------

create table public.business_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  barbershop_id uuid not null,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint business_photos_barbershop_fkey
    foreign key (organization_id, barbershop_id)
    references public.barbershops (organization_id, id) on delete restrict,
  constraint business_photos_storage_path_key unique (storage_path),
  constraint business_photos_storage_path_format
    check (private.is_business_media_path(organization_id, 'gallery', storage_path)),
  constraint business_photos_caption_length
    check (caption is null or char_length(caption) <= 120)
);

create index business_photos_barbershop_idx on public.business_photos (barbershop_id, sort_order);

-- Máximo 20 fotos por local. Bloquea el local para que dos subidas simultáneas
-- no superen el límite.
create function private.enforce_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.barbershops where id = new.barbershop_id for update;

  if (select count(*) from public.business_photos where barbershop_id = new.barbershop_id) >= 20 then
    raise exception 'photo limit reached' using errcode = 'PT008';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_photo_limit() from public, anon, authenticated;

create trigger business_photos_enforce_limit
  before insert on public.business_photos
  for each row execute function private.enforce_photo_limit();

-- ---------------------------------------------------------------------------
-- Privilegios y RLS
-- ---------------------------------------------------------------------------

revoke all on table public.business_hours, public.business_social_links, public.business_photos
from public, anon, authenticated;

grant select on table public.business_hours, public.business_social_links, public.business_photos
to authenticated;

-- Horario y redes se reemplazan solo mediante funciones; las fotos se
-- administran directamente (la ruta se valida con CHECK).
grant insert (organization_id, barbershop_id, storage_path, caption, sort_order),
      update (caption, sort_order),
      delete
  on table public.business_photos to authenticated;

alter table public.business_hours enable row level security;
alter table public.business_social_links enable row level security;
alter table public.business_photos enable row level security;

create policy business_hours_select_member
  on public.business_hours for select to authenticated
  using (private.is_active_member(organization_id));

create policy business_social_links_select_member
  on public.business_social_links for select to authenticated
  using (private.is_active_member(organization_id));

create policy business_photos_select_member
  on public.business_photos for select to authenticated
  using (private.is_active_member(organization_id));

create policy business_photos_insert_owner
  on public.business_photos for insert to authenticated
  with check (private.is_owner(organization_id));

create policy business_photos_update_owner
  on public.business_photos for update to authenticated
  using (private.is_owner(organization_id))
  with check (private.is_owner(organization_id));

create policy business_photos_delete_owner
  on public.business_photos for delete to authenticated
  using (private.is_owner(organization_id));

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-media', 'business-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Dueño activo del negocio de la carpeta. Valida el formato antes de convertir
-- la carpeta a uuid para que un nombre arbitrario no provoque un error.
create function private.can_manage_business_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(logo|cover|gallery)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$'
      then private.is_owner(((storage.foldername(p_name))[1])::uuid)
    else false
  end;
$$;

revoke all on function private.can_manage_business_media(text) from public, anon;
grant execute on function private.can_manage_business_media(text) to authenticated;

-- La lectura pública se sirve por URL pública del bucket. SELECT es necesario
-- para que la API de Storage permita reemplazar y borrar.
create policy business_media_select_owner
  on storage.objects for select to authenticated
  using (bucket_id = 'business-media' and private.can_manage_business_media(name));

create policy business_media_insert_owner
  on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and private.can_manage_business_media(name));

create policy business_media_update_owner
  on storage.objects for update to authenticated
  using (bucket_id = 'business-media' and private.can_manage_business_media(name))
  with check (bucket_id = 'business-media' and private.can_manage_business_media(name));

create policy business_media_delete_owner
  on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and private.can_manage_business_media(name));

-- ---------------------------------------------------------------------------
-- save_business_hours
--
-- p_hours: [{"weekday": 1, "opens_at": "09:00", "closes_at": "13:00"}, ...]
-- Cada día admite hasta 2 rangos que no se crucen; un día sin rangos está
-- cerrado. Reemplaza el horario completo.
-- ---------------------------------------------------------------------------

create function public.save_business_hours(p_barbershop_id uuid, p_hours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select b.organization_id into v_organization_id
  from public.barbershops b
  where b.id = p_barbershop_id
  for update;

  if v_organization_id is null or not private.is_owner(v_organization_id) then
    raise exception 'only the owner can edit the hours' using errcode = 'insufficient_privilege';
  end if;

  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    raise exception 'hours must be an array' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_hours) as e(item)
    where jsonb_typeof(e.item) <> 'object'
       or jsonb_typeof(e.item -> 'weekday') <> 'number'
       or jsonb_typeof(e.item -> 'opens_at') <> 'string'
       or jsonb_typeof(e.item -> 'closes_at') <> 'string'
       or (e.item ->> 'opens_at') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (e.item ->> 'closes_at') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (e.item ->> 'weekday') !~ '^[1-7]$'
  ) then
    raise exception 'invalid hours' using errcode = 'invalid_parameter_value';
  end if;

  -- Cierre después de la apertura, como máximo 2 rangos por día y sin cruces.
  if exists (
    with ranges as (
      select (e.item ->> 'weekday')::smallint as weekday,
             (e.item ->> 'opens_at')::time as opens_at,
             (e.item ->> 'closes_at')::time as closes_at
      from jsonb_array_elements(p_hours) as e(item)
    ), ordered as (
      select r.*,
             count(*) over (partition by r.weekday) as ranges_in_day,
             lag(r.closes_at) over (partition by r.weekday order by r.opens_at) as previous_close
      from ranges r
    )
    select 1 from ordered o
    where o.closes_at <= o.opens_at
       or o.ranges_in_day > 2
       or o.opens_at < o.previous_close
  ) then
    raise exception 'invalid hours' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.business_hours h where h.barbershop_id = p_barbershop_id;

  insert into public.business_hours (organization_id, barbershop_id, weekday, slot, opens_at, closes_at)
  select v_organization_id, p_barbershop_id, r.weekday,
         row_number() over (partition by r.weekday order by r.opens_at),
         r.opens_at, r.closes_at
  from (
    select (e.item ->> 'weekday')::smallint as weekday,
           (e.item ->> 'opens_at')::time as opens_at,
           (e.item ->> 'closes_at')::time as closes_at
    from jsonb_array_elements(p_hours) as e(item)
  ) as r;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_social_links
--
-- p_links: [{"platform": "instagram", "url": "https://instagram.com/..."}, ...]
-- Reemplaza todas las redes del local; el orden de la lista es el de la página.
-- ---------------------------------------------------------------------------

create function public.save_social_links(p_barbershop_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select b.organization_id into v_organization_id
  from public.barbershops b
  where b.id = p_barbershop_id
  for update;

  if v_organization_id is null or not private.is_owner(v_organization_id) then
    raise exception 'only the owner can edit the links' using errcode = 'insufficient_privilege';
  end if;

  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'links must be an array' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_links) as e(item)
    where jsonb_typeof(e.item) <> 'object'
       or jsonb_typeof(e.item -> 'platform') <> 'string'
       or jsonb_typeof(e.item -> 'url') <> 'string'
       or (e.item ->> 'platform') not in ('instagram', 'facebook', 'tiktok', 'youtube', 'x', 'website')
  ) then
    raise exception 'invalid links' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_links) as e(item)
    group by e.item ->> 'platform'
    having count(*) > 1
  ) then
    raise exception 'duplicate platform' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.business_social_links l where l.barbershop_id = p_barbershop_id;

  insert into public.business_social_links (organization_id, barbershop_id, platform, url, sort_order)
  select v_organization_id, p_barbershop_id,
         (e.item ->> 'platform')::public.social_platform,
         btrim(e.item ->> 'url'),
         e.position
  from jsonb_array_elements(p_links) with ordinality as e(item, position);
exception
  when check_violation then
    -- URL que no es https o demasiado larga (CHECK de la tabla).
    raise exception 'invalid links' using errcode = 'invalid_parameter_value';
end;
$$;

-- ---------------------------------------------------------------------------
-- get_public_barbershop: datos públicos de un local publicado, o null.
-- Nunca incluye clientes, visitas, miembros ni datos internos.
-- ---------------------------------------------------------------------------

create function public.get_public_barbershop(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', b.name,
    'slug', b.slug,
    'description', b.description,
    'address', b.address,
    'district', b.district,
    'city', b.city,
    'maps_url', b.maps_url,
    'phone', b.phone,
    'hours_note', b.hours_note,
    'logo_path', b.logo_path,
    'cover_path', b.cover_path,
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'weekday', h.weekday,
               'opens_at', to_char(h.opens_at, 'HH24:MI'),
               'closes_at', to_char(h.closes_at, 'HH24:MI'))
             order by h.weekday, h.slot)
      from public.business_hours h
      where h.barbershop_id = b.id
    ), '[]'::jsonb),
    'social_links', coalesce((
      select jsonb_agg(jsonb_build_object('platform', l.platform, 'url', l.url) order by l.sort_order)
      from public.business_social_links l
      where l.barbershop_id = b.id
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('path', p.storage_path, 'caption', p.caption)
             order by p.sort_order, p.created_at)
      from public.business_photos p
      where p.barbershop_id = b.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name,
               'description', s.description,
               'price', s.price::text,
               'duration_minutes', s.duration_minutes)
             order by s.sort_order, s.created_at)
      from public.services s
      join public.service_locations sl
        on sl.organization_id = s.organization_id
       and sl.service_id = s.id
       and sl.barbershop_id = b.id
       and sl.is_available
      where s.organization_id = b.organization_id
        and s.is_published
        and s.archived_at is null
    ), '[]'::jsonb)
  )
  from public.barbershops b
  join public.organizations o on o.id = b.organization_id
  where b.slug = p_slug
    and b.is_published
    and b.archived_at is null
    and o.archived_at is null;
$$;

revoke all on function public.save_business_hours(uuid, jsonb) from public, anon;
revoke all on function public.save_social_links(uuid, jsonb) from public, anon;
revoke all on function public.get_public_barbershop(text) from public;
grant execute on function public.save_business_hours(uuid, jsonb) to authenticated;
grant execute on function public.save_social_links(uuid, jsonb) to authenticated;
grant execute on function public.get_public_barbershop(text) to anon, authenticated;

-- Etapa 10 (versión 2): cuentas normales, cuenta Pro y términos (Ley 29733).
--
-- - `profiles`: versión y fecha de los Términos y la Política de Privacidad
--   aceptados. Se crea al registrarse (trigger en `auth.users`) o con
--   `accept_terms`.
-- - `subscriptions`: una por usuario, preparada para cobrar en el futuro. Hoy
--   siempre `pro`/`active`/`free`. Guarda la aceptación de las condiciones de
--   dueño.
-- - `private.is_pro`: ÚNICO punto de control del acceso Pro. `is_owner` y la
--   rama de dueño de `can_operate_barbershop` lo exigen.
-- - `private.grant_pro`: único punto donde se concede Pro (hoy gratis).
-- - `create_business` exige las condiciones de dueño vigentes y concede Pro.
-- - Los dueños existentes pasan a Pro; aceptan las condiciones en su próximo
--   ingreso.
--
-- Errores (la app los traduce al español):
--   42501 sin sesión
--   22023 datos inválidos
--   PT019 la versión de los términos aceptada no es la vigente

-- ---------------------------------------------------------------------------
-- Versiones vigentes. Deben coincidir con `src/lib/legal.ts` (lo comprueba
-- una prueba). Publicar una versión nueva = nueva migración que reemplace
-- estas funciones.
-- ---------------------------------------------------------------------------

create function private.terms_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-10-01'::text;
$$;

create function private.owner_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$
  select '2026-10-01'::text;
$$;

revoke all on function private.terms_version() from public, anon, authenticated;
revoke all on function private.owner_terms_version() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles
--
-- Se borra con la cuenta (derecho de cancelación). Sin escritura directa: se
-- modifica solo con funciones.
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_terms_version_length
    check (terms_version is null or char_length(terms_version) between 1 and 40),
  constraint profiles_terms_consistent
    check ((terms_version is null) = (terms_accepted_at is null))
);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  plan text not null default 'pro',
  status text not null default 'active',
  -- Nulo = sin vencimiento (plan gratuito actual).
  current_period_end timestamptz,
  provider text not null default 'free',
  provider_ref text,
  owner_terms_version text,
  owner_terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_user_id_key unique (user_id),
  constraint subscriptions_plan_check check (plan in ('pro')),
  constraint subscriptions_status_check
    check (status in ('active', 'trialing', 'past_due', 'canceled')),
  constraint subscriptions_provider_format
    check (char_length(provider) between 1 and 40 and provider ~ '^[a-z0-9_]+$'),
  constraint subscriptions_provider_ref_length
    check (provider_ref is null or char_length(provider_ref) between 1 and 200),
  constraint subscriptions_owner_terms_version_length
    check (owner_terms_version is null or char_length(owner_terms_version) between 1 and 40),
  constraint subscriptions_owner_terms_consistent
    check ((owner_terms_version is null) = (owner_terms_accepted_at is null))
);

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Privilegios y RLS: cada usuario lee solo lo suyo; nadie escribe directamente.
-- ---------------------------------------------------------------------------

revoke all on table public.profiles, public.subscriptions from public, anon, authenticated;
grant select on table public.profiles, public.subscriptions to authenticated;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;

create policy profiles_select_self
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy subscriptions_select_self
  on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Acceso Pro: único punto de control y único punto de concesión.
-- ---------------------------------------------------------------------------

create function private.is_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.plan = 'pro'
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Hoy Pro es gratis: crea la suscripción si no existe. No reactiva una
-- suscripción cancelada (al activar el cobro, cambiar esta función).
create function private.grant_pro(p_user_id uuid, p_owner_terms_version text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.subscriptions (user_id, owner_terms_version, owner_terms_accepted_at)
  values (p_user_id, p_owner_terms_version, now())
  on conflict (user_id) do update
    set owner_terms_version = excluded.owner_terms_version,
        owner_terms_accepted_at = excluded.owner_terms_accepted_at
    where public.subscriptions.owner_terms_version is distinct from excluded.owner_terms_version;
$$;

revoke all on function private.is_pro(uuid) from public, anon, authenticated;
revoke all on function private.grant_pro(uuid, text) from public, anon, authenticated;

-- Dueños existentes → Pro. Las condiciones de dueño quedan pendientes.
insert into public.subscriptions (user_id)
select distinct m.user_id
from public.organization_members m
where m.role = 'owner'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Autorización: el dueño debe ser Pro. Misma firma y permisos que antes.
-- ---------------------------------------------------------------------------

create or replace function private.is_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role = 'owner'
      and o.archived_at is null
      and private.is_pro(m.user_id)
  );
$$;

create or replace function private.can_operate_barbershop(p_barbershop_id uuid)
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
    join public.organization_members m
      on m.organization_id = b.organization_id
     and m.user_id = (select auth.uid())
     and m.is_active
    where b.id = p_barbershop_id
      and b.archived_at is null
      and o.archived_at is null
      and (
        (m.role = 'owner' and private.is_pro(m.user_id))
        or exists (
          select 1
          from public.barbershop_members bm
          where bm.organization_id = b.organization_id
            and bm.barbershop_id = b.id
            and bm.user_id = m.user_id
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Registro: guarda la aceptación enviada al crear la cuenta
-- (`options.data.terms_version`). Nunca hace fallar el registro: si la versión
-- no es la vigente, el panel la pedirá en el primer ingreso.
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := new.raw_user_meta_data ->> 'terms_version';
  v_current text := private.terms_version();
begin
  insert into public.profiles (user_id, terms_version, terms_accepted_at)
  values (
    new.id,
    case when v_version = v_current then v_current end,
    case when v_version = v_current then now() end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- accept_terms: usuarios existentes (o si el registro no la guardó).
-- `p_owner_terms_version` solo se acepta si el usuario ya tiene suscripción.
-- ---------------------------------------------------------------------------

create function public.accept_terms(p_terms_version text, p_owner_terms_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if p_terms_version is distinct from private.terms_version() then
    raise exception 'terms version is not current' using errcode = 'PT019';
  end if;

  if p_owner_terms_version is not null then
    if p_owner_terms_version is distinct from private.owner_terms_version() then
      raise exception 'owner terms version is not current' using errcode = 'PT019';
    end if;

    update public.subscriptions s
    set owner_terms_version = p_owner_terms_version,
        owner_terms_accepted_at = now()
    where s.user_id = v_user_id
      and s.owner_terms_version is distinct from p_owner_terms_version;

    if not exists (select 1 from public.subscriptions s where s.user_id = v_user_id) then
      raise exception 'no owner account' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  insert into public.profiles (user_id, terms_version, terms_accepted_at)
  values (v_user_id, p_terms_version, now())
  on conflict (user_id) do update
    set terms_version = excluded.terms_version,
        terms_accepted_at = excluded.terms_accepted_at
    where public.profiles.terms_version is distinct from excluded.terms_version;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_account: estado de la cuenta para el panel, calculado con las mismas
-- funciones que la autorización.
-- ---------------------------------------------------------------------------

create function public.get_my_account()
returns table (is_pro boolean, terms_accepted boolean, owner_terms_pending boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_pro(u.id),
    exists (
      select 1 from public.profiles p
      where p.user_id = u.id and p.terms_version = private.terms_version()
    ),
    exists (
      select 1 from public.subscriptions s
      where s.user_id = u.id
        and s.owner_terms_version is distinct from private.owner_terms_version()
    )
  from (select (select auth.uid()) as id) u
  where u.id is not null;
$$;

-- ---------------------------------------------------------------------------
-- create_business: ahora exige las condiciones de dueño vigentes y concede Pro
-- en la misma transacción. Se elimina la versión de 3 parámetros para que no
-- exista otro camino.
-- ---------------------------------------------------------------------------

drop function public.create_business(text, text, text);

create function public.create_business(
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

revoke all on function public.create_business(text, text, text, text) from public, anon;
revoke all on function public.accept_terms(text, text) from public, anon;
revoke all on function public.get_my_account() from public, anon;
grant execute on function public.create_business(text, text, text, text) to authenticated;
grant execute on function public.accept_terms(text, text) to authenticated;
grant execute on function public.get_my_account() to authenticated;

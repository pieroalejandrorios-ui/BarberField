-- Ejecutar completo en SQL Editor del proyecto correcto.
-- Solo para la instalación inicial. Si ya existen tablas, verificar primero.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 1: negocios, locales y membresías del personal, con RLS.
--
-- La creación del negocio junto con la membresía inicial de dueño se hará
-- mediante una función atómica en la etapa 2 (autenticación). Por eso aquí
-- ningún usuario puede insertar directamente en `organizations`.

-- ---------------------------------------------------------------------------
-- Esquema privado: funciones auxiliares que no se exponen como RPC en la API.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Ejecutar antes de volver a intentar la instalación si falta member_role.
-- No elimina ni modifica tablas o datos existentes.
do $
begin
  if to_regtype('public.member_role') is null then
    create type public.member_role as enum ('owner', 'barber');
  elsif (
    select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e
    where e.enumtypid = to_regtype('public.member_role')
  ) is distinct from array['owner', 'barber']::text[] then
    raise exception 'public.member_role existe pero no coincide con owner/barber; revisar antes de continuar';
  end if;
end;
$;


-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint organizations_name_length
    check (char_length(btrim(name)) between 1 and 120)
);

create table public.barbershops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint barbershops_name_length
    check (char_length(btrim(name)) between 1 and 120),
  constraint barbershops_address_length
    check (address is null or char_length(btrim(address)) between 1 and 200),
  -- Destino de claves foráneas compuestas (asignaciones, visitas) que impiden
  -- vincular un local con entidades de otro negocio.
  constraint barbershops_organization_id_id_key unique (organization_id, id)
);

create table public.organization_members (
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  user_id uuid not null
    references auth.users (id) on delete restrict,
  role public.member_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx
  on public.organization_members (user_id);

create table public.barbershop_members (
  organization_id uuid not null,
  barbershop_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, barbershop_id, user_id),
  -- Local y miembro deben pertenecer al mismo negocio.
  constraint barbershop_members_barbershop_fkey
    foreign key (organization_id, barbershop_id)
    references public.barbershops (organization_id, id) on delete restrict,
  constraint barbershop_members_member_fkey
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id)
    on delete restrict
);

create index barbershop_members_user_id_idx
  on public.barbershop_members (user_id, barbershop_id);

-- ---------------------------------------------------------------------------
-- Funciones de autorización
--
-- SECURITY DEFINER evita recursión de RLS al consultar membresías desde las
-- políticas. Todas fijan search_path vacío, califican tablas con esquema y
-- validan auth.uid() internamente.
-- ---------------------------------------------------------------------------

create function private.is_active_member(p_organization_id uuid)
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
      and o.archived_at is null
  );
$$;

create function private.is_owner(p_organization_id uuid)
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
  );
$$;

-- Dueño activo: todos los locales activos del negocio.
-- Barbero activo: solo los locales activos que tiene asignados.
create function private.can_operate_barbershop(p_barbershop_id uuid)
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
        m.role = 'owner'
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

revoke all on function private.is_active_member(uuid) from public, anon;
revoke all on function private.is_owner(uuid) from public, anon;
revoke all on function private.can_operate_barbershop(uuid) from public, anon;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;
grant execute on function private.can_operate_barbershop(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integridad de membresías
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Impide que un negocio se quede sin dueño activo. Bloquea la fila del negocio
-- para que dos dueños no puedan degradarse mutuamente de forma concurrente.
create function private.ensure_active_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.is_active
     and not (new.role = 'owner' and new.is_active) then
    perform 1
    from public.organizations
    where id = old.organization_id
    for update;

    if not exists (
      select 1
      from public.organization_members
      where organization_id = old.organization_id
        and user_id <> old.user_id
        and role = 'owner'
        and is_active
    ) then
      raise exception 'organization must keep at least one active owner'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;
revoke all on function private.ensure_active_owner() from public, anon, authenticated;

create trigger organization_members_touch_updated_at
  before update on public.organization_members
  for each row execute function private.touch_updated_at();

create trigger organization_members_ensure_active_owner
  before update on public.organization_members
  for each row execute function private.ensure_active_owner();

-- ---------------------------------------------------------------------------
-- Privilegios: se revocan los permisos por defecto de Supabase y se conceden
-- solo las columnas que cada operación necesita. Sin DELETE en tablas con
-- historial (se archiva o desactiva) y sin acceso anónimo.
-- ---------------------------------------------------------------------------

revoke all on table
  public.organizations,
  public.barbershops,
  public.organization_members,
  public.barbershop_members
from public, anon, authenticated;

grant select on table
  public.organizations,
  public.barbershops,
  public.organization_members,
  public.barbershop_members
to authenticated;

grant update (name) on table public.organizations to authenticated;

grant insert (organization_id, name, address),
      update (name, address, archived_at)
  on table public.barbershops to authenticated;

grant insert (organization_id, user_id, role),
      update (role, is_active)
  on table public.organization_members to authenticated;

grant insert (organization_id, barbershop_id, user_id), delete
  on table public.barbershop_members to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.barbershops enable row level security;
alter table public.organization_members enable row level security;
alter table public.barbershop_members enable row level security;

-- organizations
create policy organizations_select_member
  on public.organizations for select to authenticated
  using (private.is_active_member(id));

create policy organizations_update_owner
  on public.organizations for update to authenticated
  using (private.is_owner(id))
  with check (private.is_owner(id));

-- barbershops
create policy barbershops_select_member
  on public.barbershops for select to authenticated
  using (private.is_active_member(organization_id));

create policy barbershops_insert_owner
  on public.barbershops for insert to authenticated
  with check (private.is_owner(organization_id));

create policy barbershops_update_owner
  on public.barbershops for update to authenticated
  using (private.is_owner(organization_id))
  with check (private.is_owner(organization_id));

-- organization_members: cada usuario ve su propia membresía (también si fue
-- desactivada, para poder informarlo); el dueño ve y administra las del negocio.
create policy organization_members_select_self_or_owner
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_owner(organization_id)
  );

create policy organization_members_insert_owner
  on public.organization_members for insert to authenticated
  with check (private.is_owner(organization_id));

create policy organization_members_update_owner
  on public.organization_members for update to authenticated
  using (private.is_owner(organization_id))
  with check (private.is_owner(organization_id));

-- barbershop_members
create policy barbershop_members_select_self_or_owner
  on public.barbershop_members for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_member(organization_id))
    or private.is_owner(organization_id)
  );

create policy barbershop_members_insert_owner
  on public.barbershop_members for insert to authenticated
  with check (private.is_owner(organization_id));

create policy barbershop_members_delete_owner
  on public.barbershop_members for delete to authenticated
  using (private.is_owner(organization_id));


notify pgrst, 'reload schema';
commit;

-- Las cuatro filas deben indicar rls_enabled = true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('organizations', 'barbershops', 'organization_members', 'barbershop_members')
order by c.relname;

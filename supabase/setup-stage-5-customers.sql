-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde supabase/migrations/20261001160000_customers.sql; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 5: clientes.
--
-- - Los miembros activos registran clientes con consentimiento (Ley 29733):
--   `consent_by` debe ser quien registra y `consent_at`/`created_by` los pone
--   la base de datos.
-- - Solo el dueño edita y archiva. Nadie borra (se conserva el historial).
-- - DNI único por negocio, incluidos los archivados. El celular no es único.
-- - `public.search_customers`: búsqueda por nombre, DNI o celular, paginada.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  full_name text not null,
  dni text not null,
  phone text not null,
  consent_at timestamptz not null default now(),
  consent_by uuid not null references auth.users (id) on delete restrict,
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint customers_full_name_length
    check (char_length(full_name) between 1 and 120 and full_name = btrim(full_name)),
  constraint customers_dni_format check (dni ~ '^[0-9]{8}$'),
  constraint customers_phone_format check (phone ~ '^\+519[0-9]{8}$'),
  -- Destino de claves foráneas compuestas (visitas, ciclos, premios).
  constraint customers_organization_id_id_key unique (organization_id, id),
  constraint customers_organization_dni_key unique (organization_id, dni)
);

create index customers_organization_phone_idx on public.customers (organization_id, phone);
create index customers_organization_name_idx on public.customers (organization_id, lower(full_name));

-- Normaliza antes de los CHECK: nombre sin espacios sobrantes, DNI sin
-- espacios y celular «987 654 321» o «+51 987654321» → «+51987654321».
create function private.normalize_customer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(new.phone, ''), '[[:space:]().-]', '', 'g');
begin
  new.full_name := regexp_replace(btrim(new.full_name), '[[:space:]]+', ' ', 'g');
  new.dni := regexp_replace(new.dni, '[[:space:]]', '', 'g');

  if v_phone ~ '^9[0-9]{8}$' then
    v_phone := '+51' || v_phone;
  elsif v_phone ~ '^519[0-9]{8}$' then
    v_phone := '+' || v_phone;
  end if;
  new.phone := v_phone;

  return new;
end;
$$;

revoke all on function private.normalize_customer() from public, anon, authenticated;

create trigger customers_normalize
  before insert or update on public.customers
  for each row execute function private.normalize_customer();

create trigger customers_touch_updated_at
  before update on public.customers
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Privilegios y RLS
-- ---------------------------------------------------------------------------

revoke all on table public.customers from public, anon, authenticated;

grant select on table public.customers to authenticated;
grant insert (organization_id, full_name, dni, phone, consent_by) on table public.customers to authenticated;
grant update (full_name, dni, phone, archived_at) on table public.customers to authenticated;

alter table public.customers enable row level security;

create policy customers_select_member
  on public.customers for select to authenticated
  using (private.is_active_member(organization_id));

create policy customers_insert_member
  on public.customers for insert to authenticated
  with check (
    private.is_active_member(organization_id)
    and consent_by = (select auth.uid())
  );

create policy customers_update_owner
  on public.customers for update to authenticated
  using (private.is_owner(organization_id))
  with check (private.is_owner(organization_id));

-- ---------------------------------------------------------------------------
-- search_customers
--
-- Solo dígitos: busca por DNI (prefijo) o celular (contiene). Si no, por
-- nombre (contiene, sin distinguir mayúsculas). Sin texto, los más recientes.
-- Los archivados solo se incluyen si los pide el dueño. `total_count` es el
-- total de coincidencias para paginar.
-- ---------------------------------------------------------------------------

create function public.search_customers(
  p_organization_id uuid,
  p_query text default '',
  p_include_archived boolean default false,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  dni text,
  phone text,
  archived_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(v_query, '[[:space:]().+-]', '', 'g');
  v_include_archived boolean := coalesce(p_include_archived, false);
  v_pattern text;
begin
  if not private.is_active_member(p_organization_id) then
    raise exception 'not a member of this business' using errcode = 'insufficient_privilege';
  end if;

  if v_include_archived and not private.is_owner(p_organization_id) then
    raise exception 'only the owner can list archived customers' using errcode = 'insufficient_privilege';
  end if;

  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
     or char_length(v_query) > 120 then
    raise exception 'invalid search' using errcode = 'invalid_parameter_value';
  end if;

  -- Escapa los comodines de LIKE en lo que escribió el usuario.
  v_pattern := '%' || replace(replace(replace(lower(v_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select c.id, c.full_name, c.dni, c.phone, c.archived_at, c.created_at,
         count(*) over () as total_count
  from public.customers c
  where c.organization_id = p_organization_id
    and (v_include_archived or c.archived_at is null)
    and (
      v_query = ''
      or (v_digits ~ '^[0-9]+$' and (c.dni like v_digits || '%' or c.phone like '%' || v_digits || '%'))
      or (v_digits !~ '^[0-9]+$' and lower(c.full_name) like v_pattern)
    )
  order by
    case when v_query = '' then c.created_at end desc,
    lower(c.full_name),
    c.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.search_customers(uuid, text, boolean, integer, integer) from public, anon;
grant execute on function public.search_customers(uuid, text, boolean, integer, integer) to authenticated;


notify pgrst, 'reload schema';
commit;

-- Debe devolver customers con rls_enabled = true y anonymous_can_select = false,
-- y search_customers con anonymous_can_execute = false.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'customers';

select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'search_customers';

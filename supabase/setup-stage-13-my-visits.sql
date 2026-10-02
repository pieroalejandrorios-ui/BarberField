-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde supabase/migrations/20261001230000_my_visits.sql; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 13 (versión 2): «Mis visitas» del cliente con cuenta.
--
-- - `customers.email` opcional (minúsculas). Vincula el registro del cliente
--   con una cuenta SOLO si coincide con su correo verificado.
-- - `profiles.phone` opcional (`+519XXXXXXXX`), con `save_my_profile`. No
--   vincula todavía: el celular no se verifica (ver docs/red-barberias.md).
-- - `private.verified_email_since()`: momento desde el cual Supabase exige
--   confirmar el correo. Mientras sea null, «Mis visitas» está desactivado.
--   Las cuentas con `email_confirmed_at` anterior a esa fecha pudieron
--   confirmarse automáticamente y no se vinculan.
-- - `public.get_my_visits()`: solo agregados por barbería (visitas del ciclo,
--   meta, faltantes, total de visitas y premios disponibles). El cliente nunca
--   lee `customers` ni `visits`.
--
-- Errores:
--   42501 sin sesión
--   22023 celular inválido

-- ---------------------------------------------------------------------------
-- customers.email
-- ---------------------------------------------------------------------------

alter table public.customers
  add column email text,
  add constraint customers_email_format check (
    email is null or (
      char_length(email) between 3 and 254
      and email = lower(email)
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

-- Vacío → null; espacios y mayúsculas fuera.
create function private.normalize_customer_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  return new;
end;
$$;

revoke all on function private.normalize_customer_email() from public, anon, authenticated;

create trigger customers_normalize_email
  before insert or update of email on public.customers
  for each row execute function private.normalize_customer_email();

create index customers_email_idx on public.customers (email)
  where email is not null and archived_at is null;

-- Mismas reglas que los demás datos: inserta un miembro, edita el dueño (RLS).
grant insert (email), update (email) on table public.customers to authenticated;

-- ---------------------------------------------------------------------------
-- profiles.phone
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column phone text,
  add constraint profiles_phone_format check (phone is null or phone ~ '^\+519[0-9]{8}$');

-- Acepta «987 654 321», «+51 987654321» o vacío (borra el celular).
create function public.save_my_profile(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[[:space:]().-]', '', 'g');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if v_phone ~ '^9[0-9]{8}$' then
    v_phone := '+51' || v_phone;
  elsif v_phone ~ '^519[0-9]{8}$' then
    v_phone := '+' || v_phone;
  end if;

  if v_phone = '' then
    v_phone := null;
  elsif v_phone !~ '^\+519[0-9]{8}$' then
    raise exception 'invalid phone' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.profiles (user_id, phone)
  values (v_user_id, v_phone)
  on conflict (user_id) do update set phone = excluded.phone;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activación de la vinculación por correo
--
-- Para activarla: habilitar «Confirm email» en Supabase y luego reemplazar
-- esta función con la fecha y hora de ese momento (ver
-- `supabase/enable-my-visits.sql`).
-- ---------------------------------------------------------------------------

create function private.verified_email_since()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select null::timestamptz;
$$;

revoke all on function private.verified_email_since() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_my_visits
--
-- `status`: `disabled` (vinculación no activada), `unverified` (correo sin
-- verificar después de la activación) u `ok`. `items` solo con `ok`.
-- ---------------------------------------------------------------------------

create function public.get_my_visits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_since timestamptz := private.verified_email_since();
  v_email text;
  v_confirmed_at timestamptz;
  v_items jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if v_since is null then
    return jsonb_build_object('status', 'disabled', 'items', '[]'::jsonb);
  end if;

  select lower(u.email::text), u.email_confirmed_at
  into v_email, v_confirmed_at
  from auth.users u
  where u.id = v_user_id;

  if v_email is null or v_confirmed_at is null or v_confirmed_at < v_since then
    return jsonb_build_object('status', 'unverified', 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(item order by item ->> 'barbershop_name', item ->> 'slug'), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'barbershop_name', coalesce(b.name, o.name),
      'slug', case when b.is_published then b.slug end,
      'district', b.district,
      'total_visits', (
        select count(*)
        from public.visits v
        where v.organization_id = c.organization_id
          and v.customer_id = c.id
          and v.status = 'completed'
      ),
      'progress', case when p.id is null then null else coalesce(cy.progress, 0) end,
      'visits_required', coalesce(cy.visits_required, p.visits_required),
      'visits_remaining', case
        when p.id is null then null
        else greatest(coalesce(cy.visits_required, p.visits_required) - coalesce(cy.progress, 0), 0)
      end,
      'program_status', p.status,
      'available_rewards', (
        select count(*)
        from public.rewards r
        where r.organization_id = c.organization_id
          and r.customer_id = c.id
          and r.status = 'available'
      )
    ) as item
    from public.customers c
    join public.organizations o on o.id = c.organization_id and o.archived_at is null
    left join lateral (
      select x.name, x.slug, x.district, x.is_published
      from public.barbershops x
      where x.organization_id = c.organization_id
        and x.archived_at is null
      order by x.created_at, x.id
      limit 1
    ) b on true
    left join public.loyalty_programs p on p.organization_id = c.organization_id
    left join public.loyalty_cycles cy
      on cy.organization_id = c.organization_id
     and cy.customer_id = c.id
     and cy.status = 'open'
    where c.email = v_email
      and c.archived_at is null
  ) s;

  return jsonb_build_object('status', 'ok', 'items', v_items);
end;
$$;

revoke all on function public.save_my_profile(text) from public, anon;
revoke all on function public.get_my_visits() from public, anon;
grant execute on function public.save_my_profile(text) to authenticated;
grant execute on function public.get_my_visits() to authenticated;


notify pgrst, 'reload schema';
commit;

-- Dos funciones con anonymous_can_execute=false; linking_enabled=false hasta
-- ejecutar supabase/enable-my-visits.sql.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_my_visits', 'save_my_profile')
order by p.proname;
select private.verified_email_since() is not null as linking_enabled;

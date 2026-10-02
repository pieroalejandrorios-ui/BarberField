-- Ejecutar completo en SQL Editor del proyecto correcto, en orden, después de setup-stage-1.sql.
-- Generado desde supabase/migrations/20261001170000_loyalty_visits.sql; no editar a mano.
-- Todo se revierte ante un error; no borra datos ni desactiva RLS.
begin;

-- Etapa 6: premio por fidelidad y registro de visitas.
--
-- - `loyalty_programs`: una promoción por negocio. Solo el dueño la cambia, y
--   solo mediante `save_loyalty_program` (valida la combinación y audita).
-- - `loyalty_cycles`: progreso de cada cliente con una copia de las reglas
--   vigentes al abrir el ciclo. Editar la promoción no cambia ciclos abiertos.
-- - `visits` y `visit_items`: copia del nombre y precio de cada servicio.
-- - `rewards`: premios emitidos con sus términos congelados.
-- - `loyalty_events` y `audit_events`: solo inserción.
-- - Ninguna de estas tablas tiene escritura directa para `authenticated`:
--   todo pasa por `register_visit` y `save_loyalty_program`.
-- - `get_public_barbershop` añade el texto público de la promoción activa.
--
-- Errores (la app los traduce al español):
--   42501 sin sesión o sin permiso
--   22023 datos inválidos
--   PT009 el negocio no configuró el premio
--   PT010 el cliente está archivado
--   PT011 un servicio está archivado o no se ofrece en el local
--   PT012 clave de idempotencia repetida con datos distintos
--   PT013 se pidió aplicar el premio ganado, pero la visita no completa el ciclo
--   PT014 el premio pendiente ya no está disponible
--   PT015 el premio es un servicio gratis que no está en la visita

create type public.reward_type as enum ('free_service', 'percent_discount', 'fixed_discount', 'custom_benefit');
create type public.loyalty_program_status as enum ('active', 'paused');
create type public.loyalty_cycle_status as enum ('open', 'completed', 'voided');
create type public.visit_status as enum ('completed', 'voided');
create type public.reward_status as enum ('available', 'redeemed', 'voided');
create type public.loyalty_event_type as enum ('progress', 'reward_issued', 'reward_redeemed', 'reversal');

-- Combinaciones válidas de los términos del premio (promoción, ciclo y premio).
create function private.reward_terms_valid(
  p_type public.reward_type,
  p_service_id uuid,
  p_percent numeric,
  p_amount numeric,
  p_description text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    case p_type
      when 'free_service' then
        p_service_id is not null and p_percent is null and p_amount is null
      when 'percent_discount' then
        p_percent > 0 and p_percent <= 100 and p_service_id is null and p_amount is null
      when 'fixed_discount' then
        p_amount > 0 and p_service_id is null and p_percent is null
      when 'custom_benefit' then
        char_length(btrim(p_description)) between 1 and 200
        and p_service_id is null and p_percent is null and p_amount is null
    end,
    false
  )
  and (p_description is null or char_length(p_description) <= 200);
$$;

revoke all on function private.reward_terms_valid(public.reward_type, uuid, numeric, numeric, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  visits_required integer not null default 5,
  reward_type public.reward_type not null,
  reward_service_id uuid,
  reward_percent numeric(5,2),
  reward_amount numeric(10,2),
  reward_description text,
  public_text text,
  status public.loyalty_program_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_programs_visits_required_range check (visits_required between 1 and 50),
  constraint loyalty_programs_reward_terms check (
    private.reward_terms_valid(reward_type, reward_service_id, reward_percent, reward_amount, reward_description)
  ),
  constraint loyalty_programs_public_text_length
    check (public_text is null or char_length(btrim(public_text)) between 1 and 200),
  constraint loyalty_programs_reward_service_fkey
    foreign key (organization_id, reward_service_id)
    references public.services (organization_id, id) on delete restrict,
  constraint loyalty_programs_organization_key unique (organization_id),
  constraint loyalty_programs_organization_id_id_key unique (organization_id, id)
);

create table public.loyalty_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  program_id uuid not null,
  -- Copia de las reglas vigentes al abrir el ciclo.
  visits_required integer not null,
  reward_type public.reward_type not null,
  reward_service_id uuid,
  reward_service_name text,
  reward_percent numeric(5,2),
  reward_amount numeric(10,2),
  reward_description text,
  public_text text,
  progress integer not null default 0,
  status public.loyalty_cycle_status not null default 'open',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  voided_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint loyalty_cycles_visits_required_range check (visits_required between 1 and 50),
  constraint loyalty_cycles_progress_range check (progress between 0 and visits_required),
  constraint loyalty_cycles_reward_terms check (
    private.reward_terms_valid(reward_type, reward_service_id, reward_percent, reward_amount, reward_description)
    and (reward_type <> 'free_service' or reward_service_name is not null)
  ),
  constraint loyalty_cycles_completed_state check (
    (status = 'completed') = (completed_at is not null)
    and (status <> 'completed' or progress = visits_required)
  ),
  constraint loyalty_cycles_voided_state check ((status = 'voided') = (voided_at is not null)),
  constraint loyalty_cycles_customer_fkey
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint loyalty_cycles_program_fkey
    foreign key (organization_id, program_id)
    references public.loyalty_programs (organization_id, id) on delete restrict,
  constraint loyalty_cycles_reward_service_fkey
    foreign key (organization_id, reward_service_id)
    references public.services (organization_id, id) on delete restrict,
  constraint loyalty_cycles_organization_id_id_key unique (organization_id, id)
);

-- Un ciclo abierto por cliente.
create unique index loyalty_cycles_one_open_idx
  on public.loyalty_cycles (customer_id)
  where status = 'open';

create index loyalty_cycles_customer_idx on public.loyalty_cycles (organization_id, customer_id);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  barbershop_id uuid not null,
  customer_id uuid not null,
  attended_by uuid not null,
  created_by uuid not null,
  visited_at timestamptz not null default now(),
  customer_seq integer not null,
  subtotal numeric(10,2) not null,
  discount_total numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  status public.visit_status not null default 'completed',
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  corrected_at timestamptz,
  corrected_by uuid,
  idempotency_key uuid not null,
  request_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visits_customer_seq_positive check (customer_seq > 0),
  constraint visits_amounts check (
    subtotal >= 0
    and discount_total between 0 and subtotal
    and total = subtotal - discount_total
  ),
  constraint visits_voided_state check (
    (status = 'voided') = (voided_at is not null)
    and (voided_at is null) = (voided_by is null)
    and (voided_at is null) = (void_reason is null)
  ),
  constraint visits_void_reason_length
    check (void_reason is null or char_length(btrim(void_reason)) between 1 and 300),
  constraint visits_corrected_state check ((corrected_at is null) = (corrected_by is null)),
  constraint visits_barbershop_fkey
    foreign key (organization_id, barbershop_id)
    references public.barbershops (organization_id, id) on delete restrict,
  constraint visits_customer_fkey
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint visits_attended_by_fkey
    foreign key (organization_id, attended_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint visits_created_by_fkey
    foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint visits_voided_by_fkey
    foreign key (organization_id, voided_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint visits_corrected_by_fkey
    foreign key (organization_id, corrected_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint visits_organization_id_id_key unique (organization_id, id),
  constraint visits_customer_seq_key unique (organization_id, customer_id, customer_seq),
  constraint visits_idempotency_key unique (organization_id, idempotency_key)
);

create index visits_organization_visited_at_idx on public.visits (organization_id, visited_at desc);

create table public.visit_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  visit_id uuid not null,
  -- Orden estable de las líneas (reparto del descuento y presentación).
  position smallint not null,
  service_id uuid not null,
  service_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null,
  gross numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  net numeric(10,2) not null,
  constraint visit_items_position_positive check (position >= 1),
  constraint visit_items_service_name_length check (char_length(service_name) between 1 and 80),
  constraint visit_items_quantity_range check (quantity between 1 and 99),
  constraint visit_items_amounts check (
    unit_price >= 0
    and gross = unit_price * quantity
    and discount between 0 and gross
    and net = gross - discount
  ),
  constraint visit_items_visit_fkey
    foreign key (organization_id, visit_id)
    references public.visits (organization_id, id) on delete restrict,
  constraint visit_items_service_fkey
    foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete restrict,
  constraint visit_items_position_key unique (visit_id, position),
  constraint visit_items_service_key unique (visit_id, service_id)
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  cycle_id uuid not null,
  issued_visit_id uuid not null,
  -- Términos congelados del ciclo que lo emitió.
  reward_type public.reward_type not null,
  reward_service_id uuid,
  reward_service_name text,
  reward_percent numeric(5,2),
  reward_amount numeric(10,2),
  reward_description text,
  public_text text,
  issued_at timestamptz not null default now(),
  status public.reward_status not null default 'available',
  redeemed_visit_id uuid,
  redeemed_at timestamptz,
  redeemed_by uuid,
  discount_applied numeric(10,2),
  voided_at timestamptz,
  constraint rewards_reward_terms check (
    private.reward_terms_valid(reward_type, reward_service_id, reward_percent, reward_amount, reward_description)
    and (reward_type <> 'free_service' or reward_service_name is not null)
  ),
  constraint rewards_redeemed_state check (
    (status = 'redeemed') = (redeemed_visit_id is not null)
    and (redeemed_visit_id is null) = (redeemed_at is null)
    and (redeemed_visit_id is null) = (redeemed_by is null)
    and (redeemed_visit_id is null) = (discount_applied is null)
  ),
  constraint rewards_discount_applied_non_negative check (discount_applied is null or discount_applied >= 0),
  constraint rewards_voided_state check ((status = 'voided') = (voided_at is not null)),
  constraint rewards_customer_fkey
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint rewards_cycle_fkey
    foreign key (organization_id, cycle_id)
    references public.loyalty_cycles (organization_id, id) on delete restrict,
  constraint rewards_issued_visit_fkey
    foreign key (organization_id, issued_visit_id)
    references public.visits (organization_id, id) on delete restrict,
  constraint rewards_redeemed_visit_fkey
    foreign key (organization_id, redeemed_visit_id)
    references public.visits (organization_id, id) on delete restrict,
  constraint rewards_redeemed_by_fkey
    foreign key (organization_id, redeemed_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint rewards_reward_service_fkey
    foreign key (organization_id, reward_service_id)
    references public.services (organization_id, id) on delete restrict,
  constraint rewards_cycle_key unique (cycle_id),
  constraint rewards_organization_id_id_key unique (organization_id, id)
);

-- Un premio por visita.
create unique index rewards_one_per_visit_idx
  on public.rewards (organization_id, redeemed_visit_id)
  where redeemed_visit_id is not null;

create index rewards_available_idx
  on public.rewards (organization_id, customer_id)
  where status = 'available';

create table public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  cycle_id uuid,
  visit_id uuid,
  reward_id uuid,
  type public.loyalty_event_type not null,
  delta integer not null default 0,
  reverses_event_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  constraint loyalty_events_delta check (
    case type
      when 'progress' then delta = 1 and cycle_id is not null and visit_id is not null
      when 'reversal' then delta between -1 and 0
      else delta = 0 and reward_id is not null
    end
  ),
  constraint loyalty_events_reversal check ((type = 'reversal') = (reverses_event_id is not null)),
  constraint loyalty_events_customer_fkey
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint loyalty_events_cycle_fkey
    foreign key (organization_id, cycle_id)
    references public.loyalty_cycles (organization_id, id) on delete restrict,
  constraint loyalty_events_visit_fkey
    foreign key (organization_id, visit_id)
    references public.visits (organization_id, id) on delete restrict,
  constraint loyalty_events_reward_fkey
    foreign key (organization_id, reward_id)
    references public.rewards (organization_id, id) on delete restrict,
  constraint loyalty_events_reverses_fkey
    foreign key (organization_id, reverses_event_id)
    references public.loyalty_events (organization_id, id) on delete restrict,
  constraint loyalty_events_created_by_fkey
    foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id) on delete restrict,
  constraint loyalty_events_organization_id_id_key unique (organization_id, id)
);

create index loyalty_events_customer_idx on public.loyalty_events (organization_id, customer_id, created_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_id uuid not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  reason text,
  -- Estado anterior y nuevo; sin DNI ni celulares completos.
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_format check (action ~ '^[a-z_]{3,60}$'),
  constraint audit_events_entity_format check (entity ~ '^[a-z_]{3,60}$'),
  constraint audit_events_reason_length check (reason is null or char_length(btrim(reason)) between 1 and 300),
  constraint audit_events_actor_fkey
    foreign key (organization_id, actor_id)
    references public.organization_members (organization_id, user_id) on delete restrict
);

create index audit_events_organization_created_idx on public.audit_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger loyalty_programs_touch_updated_at
  before update on public.loyalty_programs
  for each row execute function private.touch_updated_at();

create trigger loyalty_cycles_touch_updated_at
  before update on public.loyalty_cycles
  for each row execute function private.touch_updated_at();

create trigger visits_touch_updated_at
  before update on public.visits
  for each row execute function private.touch_updated_at();

-- Historial de solo inserción, también para las funciones `security definer`.
create function private.prevent_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function private.prevent_changes() from public, anon, authenticated;

create trigger loyalty_events_append_only
  before update or delete on public.loyalty_events
  for each row execute function private.prevent_changes();

create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function private.prevent_changes();

-- ---------------------------------------------------------------------------
-- Privilegios y RLS: solo lectura. Las escrituras pasan por funciones.
-- ---------------------------------------------------------------------------

revoke all on table
  public.loyalty_programs,
  public.loyalty_cycles,
  public.visits,
  public.visit_items,
  public.rewards,
  public.loyalty_events,
  public.audit_events
from public, anon, authenticated;

grant select on table
  public.loyalty_programs,
  public.loyalty_cycles,
  public.visits,
  public.visit_items,
  public.rewards,
  public.loyalty_events,
  public.audit_events
to authenticated;

alter table public.loyalty_programs enable row level security;
alter table public.loyalty_cycles enable row level security;
alter table public.visits enable row level security;
alter table public.visit_items enable row level security;
alter table public.rewards enable row level security;
alter table public.loyalty_events enable row level security;
alter table public.audit_events enable row level security;

create policy loyalty_programs_select_member
  on public.loyalty_programs for select to authenticated
  using (private.is_active_member(organization_id));

create policy loyalty_cycles_select_member
  on public.loyalty_cycles for select to authenticated
  using (private.is_active_member(organization_id));

create policy visits_select_member
  on public.visits for select to authenticated
  using (private.is_active_member(organization_id));

create policy visit_items_select_member
  on public.visit_items for select to authenticated
  using (private.is_active_member(organization_id));

create policy rewards_select_member
  on public.rewards for select to authenticated
  using (private.is_active_member(organization_id));

create policy loyalty_events_select_member
  on public.loyalty_events for select to authenticated
  using (private.is_active_member(organization_id));

create policy audit_events_select_owner
  on public.audit_events for select to authenticated
  using (private.is_owner(organization_id));

-- ---------------------------------------------------------------------------
-- save_loyalty_program: crea o actualiza la promoción del negocio. Los ciclos
-- abiertos y los premios emitidos conservan sus términos.
-- ---------------------------------------------------------------------------

create function public.save_loyalty_program(
  p_organization_id uuid,
  p_reward_type public.reward_type,
  p_visits_required integer default 5,
  p_reward_service_id uuid default null,
  p_reward_percent numeric default null,
  p_reward_amount numeric default null,
  p_reward_description text default null,
  p_public_text text default null,
  p_status public.loyalty_program_status default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_description text := nullif(btrim(coalesce(p_reward_description, '')), '');
  v_public_text text := nullif(btrim(coalesce(p_public_text, '')), '');
  v_service_id uuid;
  v_percent numeric;
  v_amount numeric;
  v_before jsonb;
  v_program public.loyalty_programs%rowtype;
begin
  if not private.is_owner(p_organization_id) then
    raise exception 'only the owner can configure the reward' using errcode = 'insufficient_privilege';
  end if;

  -- Solo se guardan los valores que corresponden al tipo elegido.
  v_service_id := case when p_reward_type = 'free_service' then p_reward_service_id end;
  v_percent := case when p_reward_type = 'percent_discount' then p_reward_percent end;
  v_amount := case when p_reward_type = 'fixed_discount' then p_reward_amount end;

  if p_reward_type is null
     or p_status is null
     or p_visits_required is null
     or p_visits_required not between 1 and 50
     or (v_percent is not null and v_percent <> round(v_percent, 2))
     or (v_amount is not null and (v_amount <> round(v_amount, 2) or v_amount > 99999999.99))
     or (v_public_text is not null and char_length(v_public_text) > 200)
     or not private.reward_terms_valid(p_reward_type, v_service_id, v_percent, v_amount, v_description) then
    raise exception 'invalid reward' using errcode = 'invalid_parameter_value';
  end if;

  if v_service_id is not null and not exists (
    select 1
    from public.services s
    where s.organization_id = p_organization_id
      and s.id = v_service_id
      and s.archived_at is null
  ) then
    raise exception 'service not available' using errcode = 'PT011';
  end if;

  select to_jsonb(p) - 'id' - 'organization_id' - 'created_at' - 'updated_at'
  into v_before
  from public.loyalty_programs p
  where p.organization_id = p_organization_id
  for update;

  insert into public.loyalty_programs as p (
    organization_id, visits_required, reward_type, reward_service_id, reward_percent,
    reward_amount, reward_description, public_text, status
  )
  values (
    p_organization_id, p_visits_required, p_reward_type, v_service_id, v_percent,
    v_amount, v_description, v_public_text, p_status
  )
  on conflict (organization_id) do update
  set visits_required = excluded.visits_required,
      reward_type = excluded.reward_type,
      reward_service_id = excluded.reward_service_id,
      reward_percent = excluded.reward_percent,
      reward_amount = excluded.reward_amount,
      reward_description = excluded.reward_description,
      public_text = excluded.public_text,
      status = excluded.status
  returning p.* into v_program;

  insert into public.audit_events (organization_id, actor_id, action, entity, entity_id, changes)
  values (
    p_organization_id,
    (select auth.uid()),
    'loyalty_program_saved',
    'loyalty_program',
    v_program.id,
    jsonb_build_object(
      'before', v_before,
      'after', to_jsonb(v_program) - 'id' - 'organization_id' - 'created_at' - 'updated_at'
    )
  );

  return v_program.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de visitas
-- ---------------------------------------------------------------------------

-- Términos del premio en JSON, con montos como texto decimal.
create function private.reward_terms_json(
  p_type public.reward_type,
  p_service_id uuid,
  p_service_name text,
  p_percent numeric,
  p_amount numeric,
  p_description text,
  p_public_text text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'type', p_type,
    'service_id', p_service_id,
    'service_name', p_service_name,
    'percent', p_percent::text,
    'amount', p_amount::text,
    'description', p_description,
    'public_text', p_public_text
  );
$$;

-- Abre un ciclo nuevo en 0 con una copia de las reglas vigentes.
create function private.open_loyalty_cycle(p_program public.loyalty_programs, p_customer_id uuid)
returns public.loyalty_cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.loyalty_cycles%rowtype;
begin
  insert into public.loyalty_cycles (
    organization_id, customer_id, program_id, visits_required, reward_type,
    reward_service_id, reward_service_name, reward_percent, reward_amount,
    reward_description, public_text
  )
  values (
    p_program.organization_id, p_customer_id, p_program.id, p_program.visits_required, p_program.reward_type,
    p_program.reward_service_id,
    (select s.name from public.services s where s.id = p_program.reward_service_id),
    p_program.reward_percent, p_program.reward_amount,
    p_program.reward_description, p_program.public_text
  )
  returning * into v_cycle;

  return v_cycle;
end;
$$;

-- Calcula el descuento del premio sobre las líneas actuales de la visita, lo
-- reparte y actualiza los totales. Devuelve el descuento total.
--
-- - free_service: una unidad del servicio, en su línea.
-- - percent_discount: % del subtotal redondeado a 2 decimales.
-- - fixed_discount: min(monto, subtotal).
-- - custom_benefit: 0.
--
-- El reparto es proporcional en el orden de las líneas, sobre lo que queda por
-- repartir; así la última línea recibe el ajuste por redondeo y ninguna línea
-- supera su bruto. Lo reutilizará la corrección de visitas (etapa 7).
create function private.apply_reward_discount(p_visit_id uuid, p_reward_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.rewards%rowtype;
  v_subtotal numeric(10,2);
  v_discount numeric(10,2);
  v_remaining_discount numeric(10,2);
  v_remaining_gross numeric(10,2);
  v_line record;
  v_line_discount numeric(10,2);
begin
  select * into v_reward from public.rewards r where r.id = p_reward_id;
  select v.subtotal into v_subtotal from public.visits v where v.id = p_visit_id;

  update public.visit_items i
  set discount = 0, net = i.gross
  where i.visit_id = p_visit_id;

  if v_reward.reward_type = 'free_service' then
    select i.id, i.unit_price
    into v_line
    from public.visit_items i
    where i.visit_id = p_visit_id
      and i.service_id = v_reward.reward_service_id;

    if not found then
      raise exception 'reward service is not in the visit' using errcode = 'PT015';
    end if;

    v_discount := v_line.unit_price;
    update public.visit_items i
    set discount = v_discount, net = i.gross - v_discount
    where i.id = v_line.id;
  else
    v_discount := case v_reward.reward_type
      when 'percent_discount' then round(v_subtotal * v_reward.reward_percent / 100, 2)
      when 'fixed_discount' then least(v_reward.reward_amount, v_subtotal)
      else 0
    end;

    v_remaining_discount := v_discount;
    v_remaining_gross := v_subtotal;

    for v_line in
      select i.id, i.gross
      from public.visit_items i
      where i.visit_id = p_visit_id
      order by i.position
    loop
      v_line_discount := case
        when v_remaining_gross = 0 then 0
        else least(
          v_line.gross,
          v_remaining_discount,
          round(v_remaining_discount * v_line.gross / v_remaining_gross, 2)
        )
      end;

      update public.visit_items i
      set discount = v_line_discount, net = i.gross - v_line_discount
      where i.id = v_line.id;

      v_remaining_discount := v_remaining_discount - v_line_discount;
      v_remaining_gross := v_remaining_gross - v_line.gross;
    end loop;

    if v_remaining_discount <> 0 then
      raise exception 'discount distribution mismatch';
    end if;
  end if;

  update public.visits v
  set discount_total = v_discount, total = v.subtotal - v_discount
  where v.id = p_visit_id;

  return v_discount;
end;
$$;

-- Resultado de `register_visit` (también al repetir la misma clave).
create function private.visit_result(p_visit_id uuid, p_replayed boolean)
returns table (
  visit_id uuid,
  customer_seq integer,
  subtotal numeric,
  discount_total numeric,
  total numeric,
  counted boolean,
  progress integer,
  visits_required integer,
  issued_reward_id uuid,
  issued_reward_status public.reward_status,
  redeemed_reward_id uuid,
  replayed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id,
    v.customer_seq,
    v.subtotal,
    v.discount_total,
    v.total,
    exists (
      select 1 from public.loyalty_events e
      where e.visit_id = v.id and e.type = 'progress'
    ),
    c.progress,
    c.visits_required,
    ri.id,
    ri.status,
    rr.id,
    p_replayed
  from public.visits v
  left join public.loyalty_cycles c
    on c.customer_id = v.customer_id and c.status = 'open'
  left join public.rewards ri on ri.issued_visit_id = v.id
  left join public.rewards rr on rr.redeemed_visit_id = v.id
  where v.id = p_visit_id;
$$;

revoke all on function private.reward_terms_json(public.reward_type, uuid, text, numeric, numeric, text, text)
  from public, anon, authenticated;
revoke all on function private.open_loyalty_cycle(public.loyalty_programs, uuid) from public, anon, authenticated;
revoke all on function private.apply_reward_discount(uuid, uuid) from public, anon, authenticated;
revoke all on function private.visit_result(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- register_visit
--
-- `p_items`: [{"service_id": uuid, "quantity": 1..99}], de 1 a 20 servicios
-- distintos. El orden de la lista es el de las líneas.
-- ---------------------------------------------------------------------------

create function public.register_visit(
  p_barbershop_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_attended_by uuid,
  p_apply_earned_reward boolean,
  p_pending_reward_id uuid default null,
  p_idempotency_key uuid default null
)
returns table (
  visit_id uuid,
  customer_seq integer,
  subtotal numeric,
  discount_total numeric,
  total numeric,
  counted boolean,
  progress integer,
  visits_required integer,
  issued_reward_id uuid,
  issued_reward_status public.reward_status,
  redeemed_reward_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := (select auth.uid());
  v_organization_id uuid;
  v_attended_by uuid := coalesce(p_attended_by, (select auth.uid()));
  v_item_count integer;
  v_items jsonb;
  v_request_hash text;
  v_existing record;
  v_customer record;
  v_program public.loyalty_programs%rowtype;
  v_cycle public.loyalty_cycles%rowtype;
  v_reward public.rewards%rowtype;
  v_counts boolean := false;
  v_completes boolean := false;
  v_visit_id uuid;
  v_inserted integer;
  v_issued_reward_id uuid;
  v_discount numeric(10,2);
begin
  -- 1. Autorización.
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select b.organization_id into v_organization_id
  from public.barbershops b
  where b.id = p_barbershop_id;

  if v_organization_id is null or not private.can_operate_barbershop(p_barbershop_id) then
    raise exception 'cannot operate this barbershop' using errcode = 'insufficient_privilege';
  end if;

  -- Validación de la solicitud.
  if p_idempotency_key is null
     or p_customer_id is null
     or p_apply_earned_reward is null
     or p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid visit' using errcode = 'invalid_parameter_value';
  end if;

  if p_apply_earned_reward and p_pending_reward_id is not null then
    raise exception 'only one reward per visit' using errcode = 'invalid_parameter_value';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count not between 1 and 20 or exists (
    select 1
    from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'service_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(jsonb_typeof(e -> 'quantity'), '') <> 'number'
       or coalesce(e ->> 'quantity', '') !~ '^[1-9][0-9]?$'
  ) then
    raise exception 'invalid items' using errcode = 'invalid_parameter_value';
  end if;

  select jsonb_agg(
           jsonb_build_object('service_id', lower(t.e ->> 'service_id'), 'quantity', (t.e ->> 'quantity')::integer)
           order by t.ord
         )
  into v_items
  from jsonb_array_elements(p_items) with ordinality as t(e, ord);

  if (select count(distinct x ->> 'service_id') from jsonb_array_elements(v_items) x) <> v_item_count then
    raise exception 'repeated service' using errcode = 'invalid_parameter_value';
  end if;

  v_request_hash := md5(jsonb_build_object(
    'barbershop_id', p_barbershop_id,
    'customer_id', p_customer_id,
    'items', v_items,
    'attended_by', v_attended_by,
    'apply_earned_reward', p_apply_earned_reward,
    'pending_reward_id', p_pending_reward_id
  )::text);

  -- 2 y 3. Serializa los reintentos con la misma clave y luego las visitas del
  -- cliente. Dos registros simultáneos esperan su turno y ven el progreso real.
  perform pg_advisory_xact_lock(
    hashtextextended('visit-key:' || v_organization_id::text || ':' || p_idempotency_key::text, 0)
  );

  select c.id, c.archived_at
  into v_customer
  from public.customers c
  where c.id = p_customer_id
    and c.organization_id = v_organization_id
  for update;

  if not found then
    raise exception 'customer not found in this business' using errcode = 'invalid_parameter_value';
  end if;

  select v.id, v.request_hash
  into v_existing
  from public.visits v
  where v.organization_id = v_organization_id
    and v.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency key reused with different data' using errcode = 'PT012';
    end if;
    return query select * from private.visit_result(v_existing.id, true);
    return;
  end if;

  -- 4. Cliente, responsable y promoción.
  if v_customer.archived_at is not null then
    raise exception 'customer is archived' using errcode = 'PT010';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_organization_id
      and m.user_id = v_attended_by
      and m.is_active
  ) then
    raise exception 'attended_by must be an active member' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_program
  from public.loyalty_programs p
  where p.organization_id = v_organization_id;

  if not found then
    raise exception 'loyalty program not configured' using errcode = 'PT009';
  end if;

  -- 5. ¿Esta visita completa el ciclo? Solo suma si la promoción está activa.
  if v_program.status = 'active' then
    v_counts := true;

    select * into v_cycle
    from public.loyalty_cycles c
    where c.customer_id = p_customer_id
      and c.status = 'open';

    if not found then
      v_cycle := private.open_loyalty_cycle(v_program, p_customer_id);
    end if;

    v_completes := v_cycle.progress + 1 = v_cycle.visits_required;
  end if;

  -- 6. Coherencia de premios.
  if p_apply_earned_reward and not v_completes then
    raise exception 'this visit does not complete the cycle' using errcode = 'PT013';
  end if;

  if p_pending_reward_id is not null then
    select * into v_reward
    from public.rewards r
    where r.id = p_pending_reward_id
      and r.organization_id = v_organization_id
      and r.customer_id = p_customer_id
      and r.status = 'available'
    for update;

    if not found then
      raise exception 'reward not available' using errcode = 'PT014';
    end if;
  end if;

  -- 7. Visita y líneas, con nombres y precios congelados.
  insert into public.visits (
    organization_id, barbershop_id, customer_id, attended_by, created_by,
    customer_seq, subtotal, discount_total, total, idempotency_key, request_hash
  )
  values (
    v_organization_id, p_barbershop_id, p_customer_id, v_attended_by, v_user_id,
    coalesce((
      select max(v.customer_seq)
      from public.visits v
      where v.organization_id = v_organization_id
        and v.customer_id = p_customer_id
    ), 0) + 1,
    0, 0, 0, p_idempotency_key, v_request_hash
  )
  returning id into v_visit_id;

  insert into public.visit_items (
    organization_id, visit_id, position, service_id, service_name, unit_price, quantity, gross, net
  )
  select
    v_organization_id, v_visit_id, t.ord, s.id, s.name, s.price, i.quantity,
    s.price * i.quantity, s.price * i.quantity
  from jsonb_array_elements(v_items) with ordinality as t(e, ord)
  cross join lateral (
    select (t.e ->> 'service_id')::uuid as service_id, (t.e ->> 'quantity')::integer as quantity
  ) i
  join public.services s
    on s.organization_id = v_organization_id
   and s.id = i.service_id
   and s.archived_at is null
  join public.service_locations sl
    on sl.organization_id = s.organization_id
   and sl.service_id = s.id
   and sl.barbershop_id = p_barbershop_id
   and sl.is_available;

  get diagnostics v_inserted = row_count;
  if v_inserted <> v_item_count then
    raise exception 'service not available' using errcode = 'PT011';
  end if;

  update public.visits v
  set subtotal = t.sum_gross, total = t.sum_gross
  from (
    select sum(i.gross) as sum_gross
    from public.visit_items i
    where i.visit_id = v_visit_id
  ) t
  where v.id = v_visit_id;

  -- 8. Progreso. Si llega a la meta: cierra el ciclo, emite el premio y abre
  -- un ciclo nuevo en 0 con las reglas vigentes.
  if v_counts then
    update public.loyalty_cycles c
    set progress = c.progress + 1,
        status = case when v_completes then 'completed'::public.loyalty_cycle_status else c.status end,
        completed_at = case when v_completes then now() else c.completed_at end
    where c.id = v_cycle.id;

    insert into public.loyalty_events (organization_id, customer_id, cycle_id, visit_id, type, delta, created_by)
    values (v_organization_id, p_customer_id, v_cycle.id, v_visit_id, 'progress', 1, v_user_id);

    if v_completes then
      insert into public.rewards (
        organization_id, customer_id, cycle_id, issued_visit_id, reward_type, reward_service_id,
        reward_service_name, reward_percent, reward_amount, reward_description, public_text
      )
      values (
        v_organization_id, p_customer_id, v_cycle.id, v_visit_id, v_cycle.reward_type, v_cycle.reward_service_id,
        v_cycle.reward_service_name, v_cycle.reward_percent, v_cycle.reward_amount,
        v_cycle.reward_description, v_cycle.public_text
      )
      returning id into v_issued_reward_id;

      insert into public.loyalty_events (organization_id, customer_id, cycle_id, visit_id, reward_id, type, created_by)
      values (v_organization_id, p_customer_id, v_cycle.id, v_visit_id, v_issued_reward_id, 'reward_issued', v_user_id);

      perform private.open_loyalty_cycle(v_program, p_customer_id);

      if p_apply_earned_reward then
        select * into v_reward from public.rewards r where r.id = v_issued_reward_id;
      end if;
    end if;
  end if;

  -- 9. Aplicar el premio ganado o pendiente.
  if v_reward.id is not null then
    v_discount := private.apply_reward_discount(v_visit_id, v_reward.id);

    update public.rewards r
    set status = 'redeemed',
        redeemed_visit_id = v_visit_id,
        redeemed_at = now(),
        redeemed_by = v_user_id,
        discount_applied = v_discount
    where r.id = v_reward.id;

    insert into public.loyalty_events (organization_id, customer_id, cycle_id, visit_id, reward_id, type, created_by)
    values (v_organization_id, p_customer_id, v_reward.cycle_id, v_visit_id, v_reward.id, 'reward_redeemed', v_user_id);
  end if;

  return query select * from private.visit_result(v_visit_id, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_customer_loyalty: progreso del cliente, si la próxima visita completa el
-- ciclo, el premio que corresponde, los premios pendientes y la última visita.
-- ---------------------------------------------------------------------------

create function public.get_customer_loyalty(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer record;
  v_program public.loyalty_programs%rowtype;
  v_cycle public.loyalty_cycles%rowtype;
  v_progress integer := 0;
  v_required integer;
  v_reward jsonb;
begin
  select c.id, c.organization_id
  into v_customer
  from public.customers c
  where c.id = p_customer_id;

  if not found or not private.is_active_member(v_customer.organization_id) then
    raise exception 'not a member of this business' using errcode = 'insufficient_privilege';
  end if;

  select * into v_program
  from public.loyalty_programs p
  where p.organization_id = v_customer.organization_id;

  select * into v_cycle
  from public.loyalty_cycles c
  where c.customer_id = p_customer_id
    and c.status = 'open';

  if v_cycle.id is not null then
    v_progress := v_cycle.progress;
    v_required := v_cycle.visits_required;
    v_reward := private.reward_terms_json(
      v_cycle.reward_type, v_cycle.reward_service_id, v_cycle.reward_service_name,
      v_cycle.reward_percent, v_cycle.reward_amount, v_cycle.reward_description, v_cycle.public_text
    );
  elsif v_program.id is not null then
    -- Sin ciclo abierto: el próximo se abrirá con las reglas vigentes.
    v_required := v_program.visits_required;
    v_reward := private.reward_terms_json(
      v_program.reward_type, v_program.reward_service_id,
      (select s.name from public.services s where s.id = v_program.reward_service_id),
      v_program.reward_percent, v_program.reward_amount, v_program.reward_description, v_program.public_text
    );
  end if;

  return jsonb_build_object(
    'configured', v_program.id is not null,
    'program_status', v_program.status,
    'progress', v_progress,
    'visits_required', v_required,
    'next_visit_completes', coalesce(v_program.status = 'active' and v_progress + 1 = v_required, false),
    'reward', v_reward,
    'available_rewards', coalesce((
      select jsonb_agg(
               private.reward_terms_json(
                 r.reward_type, r.reward_service_id, r.reward_service_name,
                 r.reward_percent, r.reward_amount, r.reward_description, r.public_text
               ) || jsonb_build_object('id', r.id, 'issued_at', r.issued_at)
               order by r.issued_at
             )
      from public.rewards r
      where r.organization_id = v_customer.organization_id
        and r.customer_id = p_customer_id
        and r.status = 'available'
    ), '[]'::jsonb),
    'last_visit', (
      select jsonb_build_object(
               'id', v.id,
               'visited_at', v.visited_at,
               'customer_seq', v.customer_seq,
               'total', v.total::text
             )
      from public.visits v
      where v.organization_id = v_customer.organization_id
        and v.customer_id = p_customer_id
        and v.status = 'completed'
      order by v.customer_seq desc
      limit 1
    )
  );
end;
$$;

revoke all on function public.save_loyalty_program(
  uuid, public.reward_type, integer, uuid, numeric, numeric, text, text, public.loyalty_program_status
) from public, anon;
revoke all on function public.register_visit(uuid, uuid, jsonb, uuid, boolean, uuid, uuid) from public, anon;
revoke all on function public.get_customer_loyalty(uuid) from public, anon;
grant execute on function public.save_loyalty_program(
  uuid, public.reward_type, integer, uuid, numeric, numeric, text, text, public.loyalty_program_status
) to authenticated;
grant execute on function public.register_visit(uuid, uuid, jsonb, uuid, boolean, uuid, uuid) to authenticated;
grant execute on function public.get_customer_loyalty(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_public_barbershop: añade `loyalty_text`, el texto público de la promoción
-- activa. `create or replace` conserva los permisos (anon y authenticated).
-- ---------------------------------------------------------------------------

create or replace function public.get_public_barbershop(p_slug text)
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
    ), '[]'::jsonb),
    'loyalty_text', (
      select lp.public_text
      from public.loyalty_programs lp
      where lp.organization_id = b.organization_id
        and lp.status = 'active'
    )
  )
  from public.barbershops b
  join public.organizations o on o.id = b.organization_id
  where b.slug = p_slug
    and b.is_published
    and b.archived_at is null
    and o.archived_at is null;
$$;


notify pgrst, 'reload schema';
commit;

-- Deben aparecer las siete tablas con rls_enabled = true y
-- anonymous_can_select = false, y las tres funciones con anonymous_can_execute = false.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('loyalty_programs', 'loyalty_cycles', 'visits', 'visit_items', 'rewards', 'loyalty_events', 'audit_events')
order by c.relname;

select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_loyalty_program', 'register_visit', 'get_customer_loyalty')
order by p.proname;

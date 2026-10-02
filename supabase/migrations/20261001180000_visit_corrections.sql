-- Etapa 7. Aplicar después de la etapa 6. Sin escrituras directas nuevas.
-- Un ciclo reabierto puede emitir otro premio; el anulado conserva su historial.
alter table public.rewards drop constraint rewards_cycle_key;
create unique index rewards_live_cycle_idx on public.rewards (cycle_id) where status <> 'voided';
create unique index loyalty_events_one_reversal_idx on public.loyalty_events (reverses_event_id)
  where reverses_event_id is not null;

create function private.visit_snapshot(p_visit_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'visit', to_jsonb(v) - 'idempotency_key' - 'request_hash',
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.position)
      from public.visit_items i where i.visit_id = v.id), '[]'::jsonb),
    'rewards', coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
      from public.rewards r where r.issued_visit_id = v.id or r.redeemed_visit_id = v.id
        or exists (select 1 from public.loyalty_events e where e.visit_id = v.id and e.reward_id = r.id)), '[]'::jsonb),
    'cycles', coalesce((select jsonb_agg(to_jsonb(c) order by c.id)
      from public.loyalty_cycles c where c.customer_id = v.customer_id), '[]'::jsonb)
  ) from public.visits v where v.id = p_visit_id;
$$;
revoke all on function private.visit_snapshot(uuid) from public, anon, authenticated;

create function public.correct_visit(p_visit_id uuid, p_items jsonb, p_attended_by uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_visit public.visits%rowtype;
  v_before jsonb;
  v_lines jsonb;
  v_reward uuid;
  v_count integer;
  v_inserted integer;
begin
  select * into v_visit from public.visits where id = p_visit_id;
  if not found or not private.can_operate_barbershop(v_visit.barbershop_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Igual que register_visit: primero cliente, luego visita/premios.
  perform 1 from public.customers where id = v_visit.customer_id for update;
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not private.can_operate_barbershop(v_visit.barbershop_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_visit.status <> 'completed' then
    raise exception 'visit voided' using errcode = 'PT016';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 300
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid correction' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count not between 1 and 20 then
    raise exception 'invalid items' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x) <> 'object'
      or coalesce(x->>'service_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(x->>'quantity', '') !~ '^[1-9][0-9]?$') then
    raise exception 'invalid items' using errcode = '22023';
  end if;
  if (select count(distinct (x->>'service_id')::uuid) from jsonb_array_elements(p_items) x) <> v_count then
    raise exception 'duplicate services' using errcode = '22023';
  end if;
  if p_attended_by is null or not exists (select 1 from public.organization_members
    where organization_id = v_visit.organization_id and user_id = p_attended_by and is_active) then
    raise exception 'inactive attendant' using errcode = '22023';
  end if;
  v_before := private.visit_snapshot(p_visit_id);
  -- Capturar copias ANTES de reemplazar líneas. El orden es el de la solicitud.
  select jsonb_agg(jsonb_build_object('service_id', s.id,
    'service_name', coalesce(old.service_name, s.name), 'unit_price', coalesce(old.unit_price, s.price),
    'quantity', (t.x->>'quantity')::integer, 'position', t.ord) order by t.ord)
  into v_lines
  from jsonb_array_elements(p_items) with ordinality t(x, ord)
  join public.services s on s.id = (t.x->>'service_id')::uuid
    and s.organization_id = v_visit.organization_id and s.archived_at is null
  join public.service_locations sl on sl.organization_id = s.organization_id
    and sl.service_id = s.id and sl.barbershop_id = v_visit.barbershop_id and sl.is_available
  left join public.visit_items old on old.visit_id = p_visit_id and old.service_id = s.id;
  if coalesce(jsonb_array_length(v_lines), 0) <> v_count then
    raise exception 'service unavailable' using errcode = 'PT011';
  end if;
  delete from public.visit_items where visit_id = p_visit_id;
  insert into public.visit_items (organization_id, visit_id, position, service_id, service_name,
    unit_price, quantity, gross, net)
  select v_visit.organization_id, p_visit_id, position, service_id, service_name, unit_price,
    quantity, unit_price * quantity, unit_price * quantity
  from jsonb_to_recordset(v_lines) as x(position smallint, service_id uuid, service_name text,
    unit_price numeric, quantity integer);
  get diagnostics v_inserted = row_count;
  if v_inserted <> v_count then raise exception 'invalid lines' using errcode = '22023'; end if;
  update public.visits set attended_by = p_attended_by,
    subtotal = (select sum(gross) from public.visit_items where visit_id = p_visit_id),
    total = (select sum(gross) from public.visit_items where visit_id = p_visit_id),
    discount_total = 0, corrected_at = now(), corrected_by = auth.uid() where id = p_visit_id;
  select id into v_reward from public.rewards where redeemed_visit_id = p_visit_id for update;
  if v_reward is not null then
    update public.rewards set discount_applied = private.apply_reward_discount(p_visit_id, v_reward)
      where id = v_reward;
  end if;
  insert into public.audit_events (organization_id, actor_id, action, entity, entity_id, reason, changes)
  values (v_visit.organization_id, auth.uid(), 'visit_corrected', 'visit', p_visit_id, btrim(p_reason),
    jsonb_build_object('before', v_before, 'after', private.visit_snapshot(p_visit_id)));
  return p_visit_id;
end;
$$;

-- p_visit_id es obligatorio: un reintento identifica la misma visita y nunca
-- cancela automáticamente la anterior. El servidor verifica que sea la última.
create function public.void_last_visit(p_customer_id uuid, p_reason text, p_visit_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_visit public.visits%rowtype;
  v_before jsonb;
  v_event public.loyalty_events%rowtype;
  v_cycle public.loyalty_cycles%rowtype;
  v_reward public.rewards%rowtype;
begin
  select * into v_visit from public.visits where id = p_visit_id and customer_id = p_customer_id;
  if not found or not private.can_operate_barbershop(v_visit.barbershop_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 300 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  perform 1 from public.customers where id = p_customer_id for update;
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not private.can_operate_barbershop(v_visit.barbershop_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_visit.status = 'voided' then return p_visit_id; end if;
  if exists (select 1 from public.visits where customer_id = p_customer_id
    and status = 'completed' and customer_seq > v_visit.customer_seq) then
    raise exception 'only latest completed visit' using errcode = 'PT017';
  end if;
  v_before := private.visit_snapshot(p_visit_id);
  select * into v_reward from public.rewards where issued_visit_id = p_visit_id and status <> 'voided' for update;
  if found then
    if v_reward.status = 'redeemed' and v_reward.redeemed_visit_id <> p_visit_id then
      raise exception 'reward used later' using errcode = 'PT018';
    end if;
    -- Puede haberse avanzado y luego anulado el ciclo siguiente. Solo queda
    -- abierto y vacío; sus eventos originales permanecen en el historial.
    if exists (select 1 from public.loyalty_cycles where customer_id = p_customer_id
      and status = 'open' and progress <> 0) then
      raise exception 'cycle changed' using errcode = 'PT018';
    end if;
    update public.loyalty_cycles set status = 'voided', voided_at = now()
      where customer_id = p_customer_id and status = 'open' and id <> v_reward.cycle_id;
    update public.rewards set status = 'voided', voided_at = now(), redeemed_visit_id = null,
      redeemed_at = null, redeemed_by = null, discount_applied = null where id = v_reward.id;
  end if;
  -- Los premios de ciclos anteriores usados aquí vuelven a estar disponibles.
  update public.rewards set status = 'available', redeemed_visit_id = null,
    redeemed_at = null, redeemed_by = null, discount_applied = null
    where redeemed_visit_id = p_visit_id and status = 'redeemed';
  select * into v_event from public.loyalty_events where visit_id = p_visit_id and type = 'progress';
  if found then
    select * into v_cycle from public.loyalty_cycles where id = v_event.cycle_id for update;
    update public.loyalty_cycles set progress = progress - 1, status = 'open', completed_at = null
      where id = v_cycle.id;
  end if;
  -- Una reversión por cada efecto original; los eventos son de solo inserción.
  insert into public.loyalty_events (organization_id, customer_id, cycle_id, visit_id, reward_id,
    type, delta, reverses_event_id, created_by)
  select organization_id, customer_id, cycle_id, visit_id, reward_id, 'reversal',
    case when type = 'progress' then -1 else 0 end, id, auth.uid()
  from public.loyalty_events where visit_id = p_visit_id and type <> 'reversal';
  update public.visits set status = 'voided', void_reason = btrim(p_reason),
    voided_by = auth.uid(), voided_at = now() where id = p_visit_id;
  insert into public.audit_events (organization_id, actor_id, action, entity, entity_id, reason, changes)
  values (v_visit.organization_id, auth.uid(), 'visit_voided', 'visit', p_visit_id, btrim(p_reason),
    jsonb_build_object('before', v_before, 'after', private.visit_snapshot(p_visit_id)));
  return p_visit_id;
end;
$$;
revoke all on function public.correct_visit(uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.void_last_visit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.correct_visit(uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.void_last_visit(uuid, text, uuid) to authenticated;

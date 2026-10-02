-- Etapa 9: reportes del dueño.
--
-- Sin tablas nuevas: se leen `visits` y `visit_items` tal como quedaron
-- después de registrar y corregir (precios históricos y totales vigentes).
-- Las visitas anuladas no cuentan.
--
-- - `get_business_report`: resumen del negocio y por miembro que atendió.
-- - `list_report_visits`: detalle paginado de las visitas que forman los totales.
--
-- Ambas solo para el dueño activo del negocio (también si llaman a la API
-- directamente). El período son fechas de calendario en America/Lima, ambas
-- incluidas, de hasta 366 días. Los importes se suman con numeric y se
-- devuelven como texto decimal para no perder precisión en el navegador.
--
-- Errores:
--   42501 sin sesión o no es el dueño activo del negocio
--   22023 período, miembro o paginación inválidos

-- Valida el período y el miembro; devuelve el rango de instantes [inicio, fin).
create function private.report_range(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_attended_by uuid
)
returns tstzrange
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null
     or not isfinite(p_from) or not isfinite(p_to)
     or p_from < date '2000-01-01' or p_to > date '2100-12-31'
     or p_from > p_to
     or p_to - p_from > 365 then
    raise exception 'invalid report period' using errcode = 'invalid_parameter_value';
  end if;

  -- Incluye miembros desactivados: conservan su historial.
  if p_attended_by is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.user_id = p_attended_by
  ) then
    raise exception 'not a member of this business' using errcode = 'invalid_parameter_value';
  end if;

  return tstzrange(
    p_from::timestamp at time zone 'America/Lima',
    (p_to + 1)::timestamp at time zone 'America/Lima',
    '[)'
  );
end;
$$;

revoke all on function private.report_range(uuid, date, date, uuid) from public, anon, authenticated;

create function public.get_business_report(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_attended_by uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_range tstzrange;
  v_result jsonb;
begin
  if not private.is_owner(p_organization_id) then
    raise exception 'only the owner can see reports' using errcode = 'insufficient_privilege';
  end if;
  v_range := private.report_range(p_organization_id, p_from, p_to, p_attended_by);

  -- Una fila por visita: las unidades se suman por visita antes de agrupar,
  -- así unir con las líneas nunca repite subtotales ni descuentos.
  with report_visits as (
    select v.id, v.attended_by, v.subtotal, v.discount_total, v.total
    from public.visits v
    where v.organization_id = p_organization_id
      and v.status = 'completed'
      and v.visited_at >= lower(v_range)
      and v.visited_at < upper(v_range)
      and (p_attended_by is null or v.attended_by = p_attended_by)
  ),
  visit_units as (
    select i.visit_id, sum(i.quantity) as units
    from public.visit_items i
    join report_visits rv on rv.id = i.visit_id
    where i.organization_id = p_organization_id
    group by i.visit_id
  ),
  per_visit as (
    select rv.attended_by, rv.subtotal, rv.discount_total, rv.total, coalesce(u.units, 0) as units
    from report_visits rv
    left join visit_units u on u.visit_id = rv.id
  ),
  by_member as (
    select pv.attended_by,
           count(*) as visits,
           sum(pv.units) as units,
           sum(pv.subtotal) as subtotal,
           sum(pv.discount_total) as discount_total,
           sum(pv.total) as total
    from per_visit pv
    group by pv.attended_by
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totals', (
      select jsonb_build_object(
        'visits', count(*),
        'service_units', coalesce(sum(pv.units), 0),
        'subtotal', round(coalesce(sum(pv.subtotal), 0), 2)::text,
        'discount_total', round(coalesce(sum(pv.discount_total), 0), 2)::text,
        'total', round(coalesce(sum(pv.total), 0), 2)::text
      )
      from per_visit pv
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', bm.attended_by,
        'email', u.email::text,
        'role', m.role,
        'is_active', m.is_active,
        'visits', bm.visits,
        'service_units', bm.units,
        'subtotal', round(bm.subtotal, 2)::text,
        'discount_total', round(bm.discount_total, 2)::text,
        'total', round(bm.total, 2)::text
      ) order by bm.total desc, bm.visits desc, u.email)
      from by_member bm
      join public.organization_members m
        on m.organization_id = p_organization_id and m.user_id = bm.attended_by
      left join auth.users u on u.id = bm.attended_by
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

create function public.list_report_visits(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_attended_by uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  visit_id uuid,
  visited_at timestamptz,
  customer_id uuid,
  customer_name text,
  attended_by uuid,
  attended_by_email text,
  service_units bigint,
  subtotal text,
  discount_total text,
  total text,
  corrected_at timestamptz,
  items jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_range tstzrange;
begin
  if not private.is_owner(p_organization_id) then
    raise exception 'only the owner can see reports' using errcode = 'insufficient_privilege';
  end if;
  v_range := private.report_range(p_organization_id, p_from, p_to, p_attended_by);
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset not between 0 and 100000 then
    raise exception 'invalid pagination' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with page as (
    select v.id, v.visited_at, v.customer_id, v.attended_by, v.subtotal, v.discount_total,
           v.total, v.corrected_at, count(*) over () as total_count
    from public.visits v
    where v.organization_id = p_organization_id
      and v.status = 'completed'
      and v.visited_at >= lower(v_range)
      and v.visited_at < upper(v_range)
      and (p_attended_by is null or v.attended_by = p_attended_by)
    order by v.visited_at desc, v.id desc
    limit p_limit offset p_offset
  )
  select p.id, p.visited_at, p.customer_id, c.full_name, p.attended_by, u.email::text,
         li.units, p.subtotal::text, p.discount_total::text, p.total::text,
         p.corrected_at, li.items, p.total_count
  from page p
  join public.customers c on c.organization_id = p_organization_id and c.id = p.customer_id
  left join auth.users u on u.id = p.attended_by
  cross join lateral (
    select coalesce(sum(i.quantity), 0)::bigint as units,
           coalesce(jsonb_agg(jsonb_build_object(
             'service_name', i.service_name,
             'unit_price', i.unit_price::text,
             'quantity', i.quantity,
             'gross', i.gross::text,
             'discount', i.discount::text,
             'net', i.net::text
           ) order by i.position), '[]'::jsonb) as items
    from public.visit_items i
    where i.organization_id = p_organization_id and i.visit_id = p.id
  ) li
  order by p.visited_at desc, p.id desc;
end;
$$;

revoke all on function public.get_business_report(uuid, date, date, uuid) from public, anon;
revoke all on function public.list_report_visits(uuid, date, date, uuid, integer, integer) from public, anon;
grant execute on function public.get_business_report(uuid, date, date, uuid) to authenticated;
grant execute on function public.list_report_visits(uuid, date, date, uuid, integer, integer) to authenticated;

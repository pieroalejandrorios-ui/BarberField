-- Ejecutar antes de volver a intentar la instalación si falta member_role.
-- No elimina ni modifica tablas o datos existentes.
do $$
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
$$;

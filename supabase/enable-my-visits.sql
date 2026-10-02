-- Activa «Mis visitas» (vinculación de clientes con su cuenta por correo).
--
-- Ejecutar en SQL Editor SOLO DESPUÉS de activar «Confirm email» en
-- Supabase (Authentication → Sign In / Providers → Email). Fija como fecha de
-- activación el momento en que se ejecuta: las cuentas cuyo correo se
-- confirmó antes (confirmación automática) no se vinculan.
--
-- No borra datos. Para desactivarlo, reemplazar la función para que devuelva
-- null.
begin;

do $do$
begin
  execute format(
    $f$create or replace function private.verified_email_since()
       returns timestamptz
       language sql
       stable
       set search_path = ''
       as $body$ select %L::timestamptz $body$$f$,
    now()
  );
end;
$do$;

revoke all on function private.verified_email_since() from public, anon, authenticated;

commit;

-- Debe devolver la fecha y hora de activación.
select private.verified_email_since() as linking_enabled_since;

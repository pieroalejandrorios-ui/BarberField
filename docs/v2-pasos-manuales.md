# Versión 2: pasos manuales en Supabase y Vercel

Lo que las pruebas locales (PGlite) no pueden hacer por ti. Ejecutar en el proyecto de **desarrollo** primero y repetir en producción solo cuando el recorrido funcione.

## 0. Antes de empezar

- Confirmar que las etapas 6, 7 y 9 ya están aplicadas (`setup-stage-6-loyalty-visits.sql`, `setup-stage-7-visit-corrections.sql`, `setup-stage-9-reports.sql`). La versión 2 depende de ellas.
- Hacer un respaldo de la base (ver `docs/produccion.md`).

## 1. SQL en Supabase (SQL Editor), en este orden

Cada archivo es una transacción completa: si algo falla, no cambia nada. Generados con `npm.cmd run prepare:supabase` desde las migraciones; no editarlos a mano.

| Orden | Archivo | Qué comprobar al final |
| --- | --- | --- |
| 1 | `supabase/setup-stage-10-accounts-pro.sql` | 3 funciones sin acceso anónimo y `owners_without_pro = 0` |
| 2 | `supabase/setup-stage-11-workers.sql` | `one_active_barber_index_exists = false`, `limit_trigger_exists = true` |
| 3 | `supabase/setup-stage-12-network.sql` | 3 funciones con `anonymous_can_execute = true`; `rls_enabled = true` |
| 4 | `supabase/setup-stage-13-my-visits.sql` | 2 funciones sin acceso anónimo; `linking_enabled = false` |
| 5 | `supabase/verify-release.sql` | Todas las filas con `ready = true` (20 tablas, 23 funciones, 2 índices, 1 política, 4 triggers) |

**Aplicar el SQL antes de desplegar el código.** Sin `get_my_account` el panel falla para todos, y sin las funciones de la red `/barberias` muestra error.

## 2. Supabase Auth

1. **Confirm email** (Authentication → Sign In / Providers → Email): activarlo cuando quieras habilitar «Mis visitas».
   - Revisar la plantilla del correo de confirmación (en español) y la **Site URL** y **Redirect URLs** (Authentication → URL Configuration) con el dominio de Vercel.
   - Con esto activo, el registro ya no inicia sesión de inmediato: la app muestra «Tu cuenta se creó, pero falta confirmar el correo». Conviene ajustar ese texto si se activa en producción.
2. **Después** de activarlo, ejecutar `supabase/enable-my-visits.sql`. Fija la fecha desde la cual un correo confirmado es confiable. Las cuentas que se confirmaron automáticamente antes no se vinculan.
3. Si no quieres activar la confirmación todavía, no ejecutes el paso 2: «Mis visitas» muestra «Muy pronto» y no expone nada.

## 3. Vercel

- No hay variables de entorno nuevas.
- Desplegar después del paso 1. Comprobar en el despliegue:
  - `/barberias` carga (vacía si ninguna barbería cumple los requisitos);
  - `/terminos` y `/privacidad` cargan;
  - una cuenta existente es enviada a `/aceptar-terminos` al entrar al panel.

## 4. Recorrido de prueba (desarrollo)

1. Registrar una cuenta nueva aceptando términos → entra al panel como cuenta normal, ve «Ver mis visitas» y «Crear mi barbería».
2. Entrar con un dueño existente → acepta términos y condiciones de dueño → ve la insignia «Pro».
3. Crear una barbería desde «Crear» (acepta condiciones de dueño).
4. En «Página»: dirección, distrito, descripción, horario, 2 servicios publicados y publicar → aparece en `/barberias`, en «Descubre», «Nuevas» y en la fila de su distrito.
5. Cambiar el slug → el enlace anterior `/b/slug-viejo` redirige al nuevo.
6. Agregar al mismo trabajador desde 2 dueños → ve el selector de barbería. Un cuarto dueño → mensaje del límite.
7. Registrar un cliente con correo de una cuenta (tras el paso 2.2) y algunas visitas → esa cuenta ve sus visitas y cuántas faltan en «Mis visitas».

## 5. Pendiente (no se hizo)

- Texto legal definitivo de `/terminos` y `/privacidad` y los datos de contacto del responsable.
- Verificación del celular por SMS (necesaria para vincular por celular).
- Volver a verificar el correo de las cuentas creadas antes de activar «Confirm email», para que también puedan usar «Mis visitas».
- Regenerar `src/lib/supabase/database.types.ts` con `supabase gen types` (hoy está escrito a mano).

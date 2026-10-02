# Versión 2: red de barberías

Especificación de la segunda versión, aprobada el 01-oct-2026. Convierte la plataforma en una red pública de barberías y separa las cuentas normales de las cuentas Pro (dueños). **Donde este documento contradice a `docs/producto-y-reglas.md` o `docs/modelo-datos.md`, manda este documento**; los demás puntos de esos documentos siguen vigentes.

Se implementa por fases (etapas 10 a 14 en `docs/etapas.md`). Cada fase lleva migración nueva con RLS, pruebas PGlite, y lint, tipos, build y `test:db` en verde.

## Decisiones confirmadas

1. Un dueño Pro **puede** ser trabajador de otros dueños, y un trabajador **puede** crear su propio negocio (se eliminan las reglas `PT001` y `PT004` en la etapa 11). El límite es de **3 dueños distintos** con membresía de trabajador **activa**; dos locales del mismo dueño cuentan como uno.
2. «Mis visitas» se vincula **solo por correo confirmado**: `customers.email` igual al correo de la cuenta y `auth.users.email_confirmed_at` no nulo. Requiere activar «Confirm email» en Supabase. El celular del perfil no vincula hasta que exista verificación por SMS (fuera de alcance).
3. La suscripción es **por usuario** (`subscriptions.user_id`), aunque la v1 decía que se cobraría por negocio. Si más adelante se cobra por local, se añade un límite de locales al plan sin rehacer tablas.
4. `/barberias` muestra locales **publicados** (`is_published`) que **además** cumplen los requisitos de listado. `/b/[slug]` sigue exigiendo solo `is_published`, para no romper enlaces ya compartidos.
5. «Rutas antiguas»: cuando el dueño cambia el slug, el anterior redirige al nuevo (`/b/slug-viejo` → `/b/slug-nuevo`).

## 1. Cuentas, Pro y futuro pago (etapa 10)

- Todo registro nuevo es una **cuenta normal**. Solo «Crear» (menú del panel → `/panel/nuevo`) crea un negocio y convierte la cuenta en **Pro**. Pro = dueño, con acceso a visitas, premio, reportes, auditoría, equipo y Página.
- Al crear el negocio el usuario acepta las **condiciones de dueño** (es responsable de los datos de sus clientes). `create_business` exige la versión vigente y, en la misma transacción, crea o actualiza la suscripción.
- Migración: todo usuario con alguna membresía `owner` recibe una suscripción `pro`/`active`/`free`. Sus condiciones de dueño quedan sin aceptar y se le piden en su próximo ingreso.
- Tabla `subscriptions` (una por usuario): `user_id`, `plan` (`pro`), `status` (`active`, `trialing`, `past_due`, `canceled`), `current_period_end` (nulo = sin vencimiento), `provider` (`free` por ahora), `provider_ref`, `owner_terms_version`, `owner_terms_accepted_at`, fechas. Hoy siempre `pro`/`active`, gratis.
- **Único punto de control**: `private.is_pro(user_id)` (plan `pro`, estado `active` o `trialing` y periodo vigente). `private.is_owner` y la rama de dueño de `private.can_operate_barbershop` lo exigen, así que todos los módulos del dueño dependen de él. Activar el cobro = cambiar solo `is_pro` (y cómo se escriben las suscripciones). La app lo consulta con `get_my_account()`, que usa la misma función.
- Un dueño sin Pro conserva su membresía (lectura de lo que RLS permite a un miembro), pero pierde las acciones de dueño. Qué ve exactamente un dueño con la suscripción vencida se decidirá al activar el cobro.
- Varios locales por dueño: cada «Crear» es un negocio (`organizations`) con su local, datos separados, tarjeta y página propias. No cambia el aislamiento por `organization_id`.

## 2. Trabajadores (etapa 11, implementada en local)

- Funcionan igual que en la beta y su cuenta no pasa a Pro.
- Cualquier usuario puede ser trabajador (también un dueño Pro de otro negocio).
- Máximo **3 dueños distintos** con membresía activa de trabajador. Se valida en la base de datos (trigger con bloqueo por usuario) y en la interfaz.
- Si trabaja en más de un local, el encabezado del panel muestra un selector de local activo.

## 3. Red pública `/barberias` (etapa 12, implementada en local)

- `/` se mantiene. `/barberias` usa el mismo menú superior y la landing enlaza a ella.
- Filas con scroll horizontal («Descubre», «Nuevas» y una por distrito) y buscador por nombre, distrito y servicio.
- Orden aleatorio estable durante la sesión (semilla en cookie) para no repetir locales al paginar.
- `barbershops.lat` y `lng` opcionales, sin uso todavía.
- Requisitos de listado, calculados (nunca marcados a mano): nombre, dirección y al menos 2 servicios publicados, no archivados y disponibles en el local. Además, el local debe estar publicado.
- Tarjeta: logo; debajo descripción, distrito y horario. Clic → `/b/[slug]`.
- Una RPC anónima devuelve solo los datos de la tarjeta de los locales listados.
- Un slug anterior queda reservado para su local (otro no puede tomarlo).
- La tarjeta muestra el horario de hoy en Lima («Hoy 9:00–13:00 y 15:00–21:00», «Hoy cerrado» u «Horario no publicado»).

## 4. URL propia (etapa 12)

- `/b/[slug]` ya existe (único, propuesto desde el nombre, editable). Se añade el historial de slugs: los anteriores redirigen al actual.

## 5. «Mis visitas» (etapa 13, implementada en local)

- Una cuenta normal ve, por barbería, sus visitas del ciclo y cuántas le faltan para el premio. Solo lectura.
- `customers.email` opcional (minúsculas). Vincula solo si coincide con el correo **confirmado** de la cuenta.
- Perfil `/panel/perfil` con celular normalizado `+519XXXXXXXX` (no vincula todavía).
- La vinculación se activa con `supabase/enable-my-visits.sql` después de activar «Confirm email». Hasta entonces la pantalla dice «Muy pronto». Las cuentas confirmadas automáticamente antes de esa fecha no se vinculan.
- Acceso: menú «Cuenta» del encabezado del panel y botón en `/panel` para cuentas sin barbería.
- Función `security definer` que devuelve **solo agregados** (barbería, visitas, faltantes). El cliente nunca lee `customers` ni `visits`.

## 6. Políticas y privacidad, Ley 29733 (etapa 10)

- Casilla obligatoria en `/registro` para aceptar Términos y Política de Privacidad. Se guardan versión y fecha en `profiles`.
- `/terminos` y `/privacidad` con texto provisional, pendiente de revisión legal.
- Al pasar a Pro: condiciones de dueño (versión y fecha en `subscriptions`).
- Usuarios existentes: al entrar al panel sin la versión vigente aceptada, van a `/aceptar-terminos`. Lo mismo para las condiciones de dueño de quien ya es Pro.
- Las versiones vigentes viven en `src/lib/legal.ts` y en `private.terms_version()` / `private.owner_terms_version()`; una prueba verifica que coincidan. Aceptar una versión distinta de la vigente da `PT019`.

## 7. Seguridad (etapa 14)

Pasos manuales: `docs/v2-pasos-manuales.md`.

- Lectura pública solo de datos de página de locales publicados (y, para el listado, que cumplan los requisitos), siempre mediante funciones.
- DNI, celulares, clientes y visitas nunca son públicos.
- Toda tabla nueva con RLS, permisos por defecto revocados y escrituras solo mediante funciones.

## 8. Diseño

Mismo aspecto (`docs/diseno.md`): fondo marfil, verde oscuro, Geist, bordes redondeados y los componentes de `src/components/ui.tsx`. Mobile first.

## Fuera de alcance

Rol de administrador, pagos reales, geolocalización, reservas, reseñas y verificación del celular por SMS.

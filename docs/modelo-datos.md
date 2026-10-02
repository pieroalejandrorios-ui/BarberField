# Modelo de datos

> **Versión 2:** tablas y funciones nuevas o modificadas (`profiles`, `subscriptions`, `is_pro`, `create_business` con condiciones de dueño, etc.) en la sección «Versión 2» al final y en `docs/red-barberias.md`.

Tablas, Storage y funciones (RPC) de Supabase. Las reglas que implementan están en `docs/producto-y-reglas.md`.

Convenciones:

- UUID como clave primaria; nombres en inglés `snake_case`.
- Todo dato de negocio lleva `organization_id uuid not null`.
- Claves foráneas compuestas `(organization_id, id)` para impedir cruces entre negocios; cada tabla padre declara `unique (organization_id, id)`.
- Columnas `created_at` y `updated_at timestamptz`. Para archivar se usa `archived_at` en vez de borrar.
- Dinero en `numeric(10,2)`.
- RLS activado en todas las tablas. Revocar los permisos por defecto y conceder solo las columnas necesarias, como en la migración existente.

### Cambios a tablas existentes (nueva migración)

- `organizations`: añadir `updated_at` y `created_by uuid`.
- `barbershops`: añadir:
  - `updated_at`;
  - `slug text unique` (formato `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–60);
  - `description` (≤ 1000);
  - `district` y `city`;
  - `maps_url` (`https`);
  - `phone` (`+519XXXXXXXX` o teléfono fijo);
  - `hours_note` (≤ 200);
  - `logo_path` y `cover_path` (rutas en Storage);
  - `is_published boolean not null default false`.

  Conceder UPDATE de estas columnas al dueño.
- `organization_members`:
  - **Revocar el INSERT directo y el UPDATE de `role`** para `authenticated`. Los altas y reactivaciones se hacen solo mediante funciones.
  - Índice único parcial `(user_id) where role = 'barber' and is_active` (un trabajador activo en un solo negocio).
  - La regla «un trabajador activo no es dueño de otro negocio» se valida dentro de las funciones.
  - El dueño puede actualizar `is_active` de sus trabajadores mediante una función que valida la regla al reactivar.

### Tablas nuevas

| Tabla | Columnas y restricciones principales |
| --- | --- |
| `business_hours` | `organization_id`, `barbershop_id`, `weekday smallint` (1 = lunes … 7 = domingo), `slot smallint` (1 o 2), `opens_at time`, `closes_at time` (CHECK `closes_at > opens_at`). Clave primaria `(barbershop_id, weekday, slot)`. Un día sin filas se considera cerrado. |
| `business_social_links` | `id`, `organization_id`, `barbershop_id`, `platform` enum (`instagram`, `facebook`, `tiktok`, `youtube`, `x`, `website`), `url` (CHECK `^https://`, ≤ 300), `sort_order`. Único `(barbershop_id, platform)`. |
| `business_photos` | `id`, `organization_id`, `barbershop_id`, `storage_path` (único), `caption` (≤ 120), `sort_order`, `created_at`. Máximo 20 por local, validado en la función o en un trigger. |
| `customers` | `id`, `organization_id`, `full_name` (1–120), `dni text not null` CHECK `^[0-9]{8}$`, `phone text not null` CHECK `^\+519[0-9]{8}$`, `consent_at timestamptz not null`, `consent_by uuid not null`, `created_by`, fechas, `archived_at`. Índice único `(organization_id, dni)`. Índices por `(organization_id, phone)` y `lower(full_name)` (`pg_trgm` si está disponible). |
| `services` | `id`, `organization_id`, `name` (1–80), `description` (≤ 300), `price numeric(10,2) >= 0`, `duration_minutes int` entre 1 y 1440 (puede ser nulo), `is_published bool default true`, `sort_order int`, fechas, `archived_at`. |
| `service_locations` | `organization_id`, `service_id`, `barbershop_id`, `is_available bool`. Clave primaria compuesta y claves foráneas compuestas. Al crear un servicio se marca disponible en los locales activos, y al crear un local se le asignan los servicios activos (triggers). Solo lectura para los miembros; en la v1 la interfaz no la expone. |
| `loyalty_programs` | `id`, `organization_id`, `visits_required int default 5` (1–50), `reward_type` enum (`free_service`, `percent_discount`, `fixed_discount`, `custom_benefit`), `reward_service_id` (clave foránea compuesta a `services`), `reward_percent numeric(5,2)`, `reward_amount numeric(10,2)`, `reward_description` (≤ 200), `public_text` (≤ 200), `status` (`active`, `paused`), fechas. CHECK de combinación: `free_service` ⇒ servicio; `percent_discount` ⇒ 0 < % ≤ 100; `fixed_discount` ⇒ monto > 0; `custom_benefit` ⇒ descripción no vacía. Único por negocio. Sin escritura directa: se guarda con `save_loyalty_program`. |
| `loyalty_cycles` | `id`, `organization_id`, `customer_id`, `program_id`, copia de las reglas (`visits_required`, tipo, servicio y `reward_service_name`, %, monto, descripción, `public_text`), `progress int` entre 0 y `visits_required`, `status` (`open`, `completed`, `voided`), `started_at`, `completed_at`, `voided_at`. Índice único parcial: un ciclo `open` por cliente. |
| `visits` | `id`, `organization_id`, `barbershop_id`, `customer_id`, `attended_by` (miembro del negocio), `created_by`, `visited_at default now()`, `customer_seq int` (único por `(organization_id, customer_id, customer_seq)`), `subtotal`, `discount_total`, `total` (CHECK `total = subtotal - discount_total`, ≥ 0), `status` (`completed`, `voided`), `void_reason`, `voided_by`, `voided_at`, `corrected_at`, `corrected_by`, `idempotency_key uuid` (único por negocio), `request_hash text`. |
| `visit_items` | `id`, `organization_id`, `visit_id`, `position` (orden estable, desde 1), `service_id`, `service_name` y `unit_price` (copias), `quantity int` entre 1 y 99, `gross`, `discount`, `net`. CHECK: `gross = unit_price*quantity`, `net = gross - discount`, `0 <= discount <= gross`. Únicos `(visit_id, position)` y `(visit_id, service_id)`: un servicio aparece una sola vez por visita. |
| `rewards` | `id`, `organization_id`, `customer_id`, `cycle_id` (único), `issued_visit_id`, copia de los términos (tipo, servicio y `reward_service_name`, %, monto, descripción, `public_text`), `issued_at`, `status` (`available`, `redeemed`, `voided`), `redeemed_visit_id`, `redeemed_at`, `redeemed_by`, `discount_applied`, `voided_at`. Índice único parcial `(organization_id, redeemed_visit_id)`: un premio por visita. |
| `loyalty_events` | `id`, `organization_id`, `customer_id`, `cycle_id`, `visit_id`, `reward_id`, `type` (`progress`, `reward_issued`, `reward_redeemed`, `reversal`), `delta int`, `reverses_event_id`, `created_at`, `created_by`. Solo inserción. |
| `audit_events` | `id`, `organization_id`, `actor_id`, `action` (`visit_corrected`, `visit_voided`, `customer_updated`, `customer_archived`, `member_added`, `member_deactivated`, …), `entity`, `entity_id`, `reason`, `changes jsonb` (estado anterior y nuevo; sin DNI ni celular completos), `created_at`. Solo se inserta desde funciones; el dueño puede leer. |

`loyalty_programs`, `visits`, `visit_items`, `loyalty_cycles`, `rewards`, `loyalty_events` y `audit_events` **no tienen INSERT, UPDATE ni DELETE directo** para `authenticated`. Se modifican solo mediante las funciones de abajo. `loyalty_events` y `audit_events` tienen además un trigger que impide UPDATE y DELETE, incluso desde funciones `security definer`. Los miembros activos del negocio tienen SELECT por RLS, excepto `audit_events`, que solo lee el dueño.

`customers`: INSERT para miembros activos (con `consent_by = auth.uid()`; `consent_at` y `created_by` los pone la base de datos y no se conceden); UPDATE de `full_name`, `dni`, `phone` y `archived_at` solo para el dueño; sin DELETE. Un trigger normaliza antes de los CHECK: nombre sin espacios sobrantes, DNI sin espacios y celular a `+519XXXXXXXX` (acepta espacios, guiones y prefijo 51/+51). El índice por nombre es `(organization_id, lower(full_name))`; no se usa `pg_trgm` en la v1.

### Storage

- Bucket `business-media`, **público para lectura**: las URLs se sirven directamente en la página pública.
- Rutas: `{organization_id}/logo/{uuid}.webp`, `{organization_id}/cover/{uuid}.webp` y `{organization_id}/gallery/{uuid}.webp`.
- Políticas en `storage.objects`: SELECT, INSERT, UPDATE y DELETE solo si `private.can_manage_business_media(name)`: la ruta tiene el formato esperado y `private.is_owner(((storage.foldername(name))[1])::uuid)`. SELECT es necesario para que la API de Storage permita borrar; la lectura pública usa la URL pública del bucket.
- `logo_path`, `cover_path` y `business_photos.storage_path` tienen CHECK de ruta dentro de la carpeta de su negocio (`private.is_business_media_path`). Se aceptan las extensiones `webp`, `jpg` y `png` (el navegador convierte a WebP y, si no puede, a JPEG).
- `business_photos`: máximo 20 por local con un trigger que bloquea el local; error `PT008`.
- Límites del bucket: 5 MB y tipos `image/jpeg`, `image/png` e `image/webp`.
- La subida va directamente del navegador a Storage con el cliente de navegador (las políticas la protegen); después, una Server Action guarda la ruta en la tabla.
- Al reemplazar o eliminar una foto, borrar también el archivo anterior de Storage.
- Las fotos de una página no publicada son accesibles si alguien conoce la URL. Se acepta en la v1.

### Funciones (RPC)

Todas `security definer`, `set search_path = ''` y con tablas calificadas por esquema. Validan `auth.uid()`, la membresía y el rol dentro de la función. Aplicar `revoke all ... from public, anon` y `grant execute ... to authenticated` (salvo la pública). Los errores usan `errcode` y mensajes que la app traduce al español.

- `public.create_business(p_name, p_address, p_slug)` → `uuid`.
  - Requiere sesión.
  - Rechaza si el usuario es trabajador activo de algún negocio.
  - Crea negocio, membresía `owner` y local en una sola transacción.
  - Errores: `42501` sin sesión, `22023` datos inválidos, `23505` slug en uso y `PT001` trabajador activo.
- `public.add_worker_by_email(p_organization_id, p_email)`.
  - Solo el dueño.
  - Busca en `auth.users` por correo, sin distinguir mayúsculas.
  - Aplica las reglas de «Equipo» (`docs/producto-y-reglas.md`), crea la membresía `barber` y la asignación al local.
  - Errores distintos para «no existe la cuenta», «ya trabaja en otro negocio» y «es dueño de un negocio».
  - Devuelve solo el id y el correo; no expone otros datos de `auth.users`.
  - Si el usuario es un trabajador desactivado del mismo negocio, lo reactiva con las mismas validaciones.
  - Errores: `42501` no es el dueño, `22023` correo inválido, `PT002` no existe la cuenta, `PT003` es el propio dueño, `PT004` es dueño de un negocio activo (o de este), `PT005` ya trabaja en otro negocio y `PT006` ya es trabajador activo de este.
- `public.set_worker_active(p_organization_id, p_user_id, p_active)`: solo el dueño y solo sobre trabajadores (`PT007` si no lo es); al reactivar valida las mismas reglas (`PT004`, `PT005`). `organization_members` no tiene UPDATE directo para `authenticated`.
- `public.list_team(p_organization_id)`: devuelve `user_id`, correo, rol, estado y fecha. El dueño ve a todos; el trabajador solo a los miembros activos (para el selector «Atendido por»). Como no hay nombres de usuario, se identifican por correo.
- `public.reorder_services(p_organization_id, p_service_ids uuid[])`: solo el dueño; asigna `sort_order` según la posición en la lista, en una transacción. `22023` si la lista está vacía, tiene repetidos o incluye servicios de otro negocio.
- `public.search_customers(p_organization_id, p_query, p_include_archived, p_limit, p_offset)`: miembros activos. Si el texto es solo dígitos (se ignoran espacios, `+`, guiones y paréntesis) busca DNI por prefijo o celular que lo contenga; si no, nombre que lo contenga sin distinguir mayúsculas (comodines escapados). Sin texto, los más recientes. Archivados solo si los pide el dueño (`42501` si no). Devuelve `total_count` para paginar; `22023` si `p_limit` no está entre 1 y 100 o `p_offset < 0`.
- `public.save_business_hours(p_barbershop_id, p_hours jsonb)`: solo el dueño; reemplaza el horario completo en una transacción. Formato: `[{"weekday": 1, "opens_at": "09:00", "closes_at": "13:00"}, …]`; rechaza (`22023`) cierre antes de la apertura, más de 2 rangos por día y rangos cruzados.
- `public.save_social_links(p_barbershop_id, p_links jsonb)`: solo el dueño; reemplaza todas las redes (`[{"platform", "url"}]`, el orden de la lista es el de la página). `business_social_links` no tiene escritura directa. `22023` si una URL no es `https` o una plataforma se repite.
- `public.save_loyalty_program(p_organization_id, p_reward_type, p_visits_required default 5, p_reward_service_id, p_reward_percent, p_reward_amount, p_reward_description, p_public_text, p_status default active)` → `uuid`: solo el dueño; crea o reemplaza la promoción del negocio. Descarta los valores que no corresponden al tipo, valida la combinación (`22023`, también con más de 2 decimales) y que el servicio gratis esté activo en el negocio (`PT011`). No toca ciclos abiertos ni premios emitidos. Registra `loyalty_program_saved` en `audit_events` con el estado anterior y el nuevo.
- `public.register_visit(p_barbershop_id, p_customer_id, p_items jsonb /* [{service_id, quantity}] */, p_attended_by uuid, p_apply_earned_reward boolean, p_pending_reward_id uuid default null, p_idempotency_key uuid)` → visita, progreso y premio emitido o aplicado. En una sola transacción:
  1. Autorizar con `private.can_operate_barbershop`. Validar que `attended_by` sea un miembro activo del negocio.
  2. Idempotencia: si la clave ya existe con el mismo `request_hash`, devolver el resultado original; con un hash distinto, error de conflicto.
  3. Bloquear la fila del cliente (`for update`).
  4. Validar que el cliente esté activo y sea del negocio, que los servicios no estén archivados y que exista una promoción configurada. Congelar nombres y precios.
  5. Calcular si la visita completa el ciclo abierto (si la promoción está activa).
  6. Validar la coherencia: `p_apply_earned_reward = true` solo si la visita completa el ciclo (si no, error de conflicto). `p_pending_reward_id` debe ser un premio `available` del cliente. No se pueden aplicar dos premios en la misma visita.
  7. Insertar la visita y sus líneas con el siguiente `customer_seq`.
  8. Sumar progreso y registrar el evento. Si llega a la meta: cerrar el ciclo, emitir el premio y abrir un ciclo nuevo en 0 copiando las reglas vigentes.
  9. Si corresponde, aplicar el premio (ganado o pendiente): calcular y repartir el descuento, actualizar los totales y marcarlo `redeemed`.
  10. Cualquier error revierte todo.

  Detalles de la implementación:
  - `p_items`: de 1 a 20 servicios distintos, `quantity` entera entre 1 y 99; el orden de la lista es el de las líneas. `p_attended_by` nulo significa quien registra.
  - Antes del bloqueo del cliente toma un bloqueo transaccional por `(negocio, clave)`, para que dos reintentos simultáneos con la misma clave no choquen con el índice único.
  - Devuelve una fila: `visit_id`, `customer_seq`, `subtotal`, `discount_total`, `total`, `counted` (si sumó al ciclo), `progress` y `visits_required` del ciclo abierto, `issued_reward_id`, `issued_reward_status`, `redeemed_reward_id` y `replayed` (true si devolvió una visita ya registrada con la misma clave).
  - La visita del canje de un premio pendiente también suma al ciclo actual.
  - El descuento se calcula y reparte en `private.apply_reward_discount` (reutilizable por `correct_visit`): `free_service` va a la línea de ese servicio; los demás se reparten de forma proporcional sobre lo que queda por repartir, en el orden de las líneas, así la última recibe el ajuste por redondeo.
  - Errores: `42501` sin sesión o sin permiso en el local; `22023` datos inválidos, cliente de otro negocio, `attended_by` no activo o dos premios a la vez; `PT009` sin promoción; `PT010` cliente archivado; `PT011` servicio archivado, de otro negocio o no disponible en el local; `PT012` clave repetida con datos distintos; `PT013` se pidió aplicar el premio ganado pero la visita no completa el ciclo; `PT014` premio pendiente no disponible; `PT015` `free_service` sin ese servicio en la visita.
- `public.correct_visit(p_visit_id, p_items jsonb, p_attended_by uuid, p_reason text)` → `uuid`: dueño o trabajador asignado al local; motivo de 1–300 caracteres, entre 1 y 20 servicios únicos con cantidades de 1–99, miembro activo. Conserva nombre y precio de las líneas mantenidas, toma copias actuales para las nuevas y recalcula el descuento con los términos originales. No cambia puntos. Audita antes y después, incluidas líneas, ciclos y premios. `PT016` si está anulada; `PT011` servicio no disponible; `PT015` quitar servicio gratis aplicado.
- `public.void_last_visit(p_customer_id, p_reason text, p_visit_id uuid)` → `uuid`: dueño o trabajador asignado al local; motivo obligatorio. El ID de la visita es obligatorio para identificar los reintentos: si ya está anulada devuelve ese mismo ID, nunca anula automáticamente la anterior. Bloquea primero el cliente, luego visita, ciclos y premios, igual que el registro. `PT017` si no es la última completada; `PT018` si el premio mantiene un canje posterior o el ciclo tiene movimientos incompatibles. Revierte cada evento original mediante otro evento enlazado (índice único por `reverses_event_id`); audita antes y después. El premio anulado queda conservado y el ciclo reabierto puede emitir otro: solo hay un premio no anulado por ciclo.
- `public.get_customer_loyalty(p_customer_id)` → `jsonb`: miembros activos del negocio del cliente (`42501` si no). Claves: `configured`, `program_status`, `progress`, `visits_required` y `reward` del ciclo abierto (o de la promoción vigente si aún no hay ciclo), `next_visit_completes`, `available_rewards` (términos, `id` e `issued_at`) y `last_visit` (`id`, `visited_at`, `customer_seq`, `total`). Los términos tienen `type`, `service_id`, `service_name`, `percent` y `amount` (texto decimal), `description` y `public_text`.
- `public.get_business_report(p_organization_id, p_from date, p_to date, p_attended_by uuid default null)` → `jsonb`: solo el dueño activo (`private.is_owner`; `42501` si no, comprobado antes que los filtros). Período en fechas de Lima, ambas incluidas, convertido a `[p_from 00:00, p_to + 1 00:00)` en `America/Lima` por `private.report_range`; `22023` si falta una fecha, no es finita, está fuera de 2000–2100, `p_from > p_to`, supera 366 días o `p_attended_by` no es miembro del negocio (activo o no). Solo visitas `completed` del negocio. Claves: `from`, `to`, `totals` y `members` (uno por `attended_by` con `user_id`, `email`, `role`, `is_active`), cada uno con `visits`, `service_units`, y `subtotal`, `discount_total` y `total` como texto decimal. Las unidades se suman por visita antes de agrupar, para no repetir importes al unir con `visit_items`.
- `public.list_report_visits(p_organization_id, p_from, p_to, p_attended_by default null, p_limit default 20, p_offset default 0)` → tabla: mismas reglas de acceso y período; `p_limit` 1–50 y `p_offset` 0–100000 (`22023`). Devuelve `visit_id`, `visited_at`, `customer_id`, `customer_name` (sin DNI ni celular), `attended_by`, `attended_by_email`, `service_units`, `subtotal`, `discount_total`, `total` (texto), `corrected_at`, `items` (`service_name`, `unit_price`, `quantity`, `gross`, `discount`, `net`, en orden de línea) y `total_count`. Orden: más recientes primero.
- Los reportes no crean tablas ni índices: usan `visits_organization_visited_at_idx` y el índice único `(visit_id, position)` de `visit_items`.
- `public.get_public_barbershop(p_slug text)` → `jsonb`. **Es la única función concedida a `anon`.** Devuelve solo:
  - los datos públicos del local publicado;
  - las rutas de logo, portada y galería;
  - el horario y las redes;
  - los servicios publicados y no archivados (nombre, descripción, precio, duración, orden);
  - el `public_text` de la promoción activa.

  Si el slug no existe, no está publicado o el negocio está archivado, devuelve `null`. Claves: `name`, `slug`, `description`, `address`, `district`, `city`, `maps_url`, `phone`, `hours_note`, `logo_path`, `cover_path`, `hours`, `social_links`, `photos` (`path`, `caption`) y `services` (`price` como texto decimal) y `loyalty_text` (el `public_text` de la promoción activa, o `null`).

Al terminar cada migración, regenerar los tipos con `supabase gen types typescript` → `src/lib/supabase/database.types.ts` y tipar los clientes con `Database`.

## Versión 2

Reglas en `docs/red-barberias.md`.

### Etapa 10: cuentas, Pro y términos (`20261001200000_accounts_pro_terms.sql`)

| Tabla | Columnas y restricciones |
| --- | --- |
| `profiles` | `user_id` (PK, `auth.users` con `on delete cascade`), `terms_version` (≤ 40), `terms_accepted_at` (ambos nulos o ambos presentes), fechas. Se crea por trigger al registrarse (`private.handle_new_user`, lee `raw_user_meta_data.terms_version` y solo guarda la versión vigente; nunca hace fallar el registro) o con `accept_terms`. |
| `subscriptions` | `id`, `user_id` único, `plan` (`pro`), `status` (`active`, `trialing`, `past_due`, `canceled`), `current_period_end` (nulo = sin vencimiento), `provider` (`free` por ahora; `^[a-z0-9_]+$`), `provider_ref`, `owner_terms_version`, `owner_terms_accepted_at`, fechas. |

Ambas: SELECT solo de la fila propia por RLS; sin INSERT, UPDATE ni DELETE para `authenticated`; nada para `anon`.

Funciones privadas (sin EXECUTE para la API):

- `private.terms_version()` y `private.owner_terms_version()`: versiones vigentes; deben coincidir con `src/lib/legal.ts`.
- `private.is_pro(user_id)`: **único punto de control** del acceso Pro (plan `pro`, estado `active`/`trialing`, periodo vigente o nulo). Lo exigen `private.is_owner` y la rama de dueño de `private.can_operate_barbershop` (redefinidas con la misma firma).
- `private.grant_pro(user_id, owner_terms_version)`: único punto de concesión; hoy crea la suscripción gratuita y no reactiva una cancelada.

RPC:

- `public.create_business(p_name, p_address, p_slug, p_owner_terms_version)` → `uuid`. Reemplaza a la versión de 3 parámetros (eliminada). `PT019` si la versión de las condiciones de dueño no es la vigente; concede Pro en la misma transacción. Mantiene `PT001` hasta la etapa 11.
- `public.accept_terms(p_terms_version, p_owner_terms_version default null)`: requiere sesión (`42501`); `PT019` si alguna versión no es la vigente; `22023` si envía condiciones de dueño sin suscripción. Idempotente.
- `public.get_my_account()` → una fila `is_pro`, `terms_accepted` (versión vigente aceptada) y `owner_terms_pending` (tiene suscripción y no aceptó la versión vigente de dueño). Solo `authenticated`.
- Error nuevo `PT019`: versión de términos no vigente.

Migración de datos: todo usuario con alguna membresía `owner` recibe una suscripción `pro`/`active`/`free` con las condiciones de dueño pendientes.

### Etapa 11: trabajadores multi-dueño (`20261001210000_workers_multi_owner.sql`)

- Se elimina el índice `organization_members_one_active_barber_idx`.
- `private.assert_worker_owner_limit(user, org)`: cuenta los dueños activos distintos (sin contar al propio usuario) de los negocios donde es trabajador activo más los de `org`; más de 3 → `PT020`. Incluye negocios archivados.
- Trigger `organization_members_worker_owner_limit` (BEFORE INSERT o UPDATE de `role`/`is_active`): al pasar a trabajador activo toma `private.lock_user_memberships` y valida el límite, también para escrituras fuera de las funciones.
- `private.assert_can_work_at` (misma firma) solo valida el límite: ya no lanza `PT004` por ser dueño de otro negocio ni `PT005`. `add_worker_by_email` conserva `PT003`, `PT004` (dueño de este negocio) y `PT006`.
- `create_business` (misma firma) ya no lanza `PT001`; toma el mismo bloqueo por usuario.
- `PT001` y `PT005` quedan sin uso (se conservan sus mensajes por compatibilidad).

### Etapa 12: red pública (`20261001220000_network.sql`)

- `barbershops.lat`/`lng` `numeric(9,6)` opcionales (rango y en pareja), sin permiso de escritura todavía.
- `barbershop_slug_history`: `slug` (PK, mismo formato), `organization_id`, `barbershop_id` (FK compuesta, `on delete cascade`), `created_at`. El trigger `barbershops_record_slug_history` (AFTER UPDATE OF slug) guarda el slug anterior y borra el nuevo del historial. El trigger `barbershops_reserve_slug_history` (BEFORE INSERT/UPDATE OF slug) impide que otro local tome un slug anterior (`23505` sobre `barbershops_slug_key`). SELECT solo del dueño; sin escritura directa; nada para `anon`.
- `private.barbershop_is_listed(barbershop_id)`: publicado, local y negocio no archivados, slug, nombre y dirección no vacíos, y al menos 2 servicios publicados, no archivados y disponibles en el local.
- `public.resolve_barbershop_slug(p_slug)` → slug actual de un local publicado si `p_slug` es anterior y no está en uso; si no, null. `anon`.
- `public.list_network_barbershops(p_seed, p_query, p_district, p_sort, p_limit, p_offset)` → `slug`, `name`, `description` (≤ 300), `district`, `city`, `logo_path`, `hours` (jsonb), `created_at`, `total_count`. Solo locales listados. `p_sort`: `random` (`md5(id || seed)`, estable por semilla) o `newest`. Busca por nombre, distrito o servicio publicado (comodines escapados). `22023` si `p_limit` no está entre 1 y 48, `p_offset` entre 0 y 10000, la semilla supera 64, la búsqueda o el distrito superan 80 o el orden es desconocido. `anon`.
- `public.list_network_districts(p_limit)` → `district`, `barbershop_count` de locales listados, agrupados sin distinguir mayúsculas. `anon`.
- Funciones para `anon` desde la v2: `get_public_barbershop`, `resolve_barbershop_slug`, `list_network_barbershops` y `list_network_districts` (lo verifica `tests/db/security-v2.test.mts`).

### Etapa 13: «Mis visitas» (`20261001230000_my_visits.sql`)

- `customers.email` opcional (CHECK de formato y minúsculas; el trigger `customers_normalize_email` recorta, pasa a minúsculas y convierte vacío en null). INSERT para miembros y UPDATE para el dueño, como el resto de columnas. Índice parcial `customers_email_idx`.
- `profiles.phone` opcional (`+519XXXXXXXX`); `public.save_my_profile(p_phone)` normaliza (espacios, guiones, `51`/`+51`), vacío lo borra y `22023` si no es celular.
- `private.verified_email_since()`: null = vinculación desactivada. `supabase/enable-my-visits.sql` la reemplaza con la fecha de activación de «Confirm email».
- `public.get_my_visits()` → jsonb `{status, items}`. `status`: `disabled`, `unverified` (correo sin confirmar o confirmado antes de la activación) u `ok`. Cada item: `barbershop_name`, `slug` (solo si está publicada), `district`, `total_visits` (completadas), `progress`, `visits_required`, `visits_remaining` (null si no hay premio configurado), `program_status` y `available_rewards`. Vincula clientes no archivados de negocios no archivados cuyo `email` coincide con el de la cuenta. Nunca devuelve DNI, celular, nombre registrado ni IDs.

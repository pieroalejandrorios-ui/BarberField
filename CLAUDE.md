# SaaS para barberías

Plataforma web donde cualquier usuario crea una cuenta y registra las barberías de las que es dueño. El dueño agrega trabajadores con su correo (v1: un trabajador pertenece a una sola barbería; v2: hasta 3 dueños distintos). El dueño y los trabajadores registran clientes (nombre, DNI, celular) y visitas. Cada N visitas (5 por defecto, configurable por el dueño) el cliente gana un premio que define el dueño. Cada barbería tiene una página pública personalizable: descripción, fotos, servicios con precios, horario, redes sociales y ubicación.

Público: barberías pequeñas en Perú. Interfaz en español, moneda PEN, zona horaria `America/Lima`, mobile first. Gratis por ahora; desde la v2 la cuenta Pro (dueño) pasa por `private.is_pro` y `subscriptions` (por usuario) para cobrar en el futuro. La v2 añade la red pública `/barberias`, términos y «Mis visitas».

## Dónde está cada cosa

Lee el documento que corresponda **antes** de trabajar en ese tema. No los cargues todos si la tarea no lo necesita.

| Documento | Contenido | Leer cuando |
| --- | --- | --- |
| `docs/red-barberias.md` | **Versión 2** (red de barberías, Pro, términos, multi-dueño, «Mis visitas»). Manda sobre los demás si se contradicen | Cualquier tarea de las etapas 10 a 14 |
| `docs/producto-y-reglas.md` | Alcance (incluye lo que **no** se implementa), roles y permisos, reglas de clientes, servicios, visitas, premio y página pública | Cualquier tarea que toque comportamiento o permisos |
| `docs/modelo-datos.md` | Tablas, restricciones, Storage y funciones RPC | Migraciones, RLS, funciones o consultas |
| `docs/rutas.md` | Pantallas, rutas, acceso y protección | Páginas, layouts o `proxy.ts` |
| `docs/etapas.md` | Qué incluye cada etapa y sus pruebas mínimas | Al empezar o cerrar una etapa |
| `docs/supuestos.md` | Decisiones pendientes de confirmar | Si algo de la especificación parece ambiguo |
| `docs/produccion.md` | Entornos, publicación, respaldos, restauración y evidencia pendiente | Despliegues u operación |
| `docs/v2-pasos-manuales.md` | SQL, Auth y Vercel pendientes de la versión 2, en orden | Al aplicar la v2 en Supabase o desplegarla |
| `docs/diseno.md` | Identidad Barber Field, paleta, componentes y CTA fijo | Cambios visuales |

Si una instrucción del usuario contradice estos documentos, pregunta antes de implementar y luego actualiza el documento.

## Stack y comandos

- Next.js 16 (App Router) + React 19 + TypeScript estricto + Tailwind 4 + Supabase (`@supabase/ssr`, Auth, Postgres, Storage).
- Pruebas de base de datos con PGlite en `tests/db/` (`createTestDatabase`, `runAs`).
- En Windows usar `npm.cmd` (PowerShell puede bloquear `npm`).

| Tarea | Comando |
| --- | --- |
| Desarrollo | `npm.cmd run dev` |
| Lint | `npm.cmd run lint` |
| Tipos | `npx tsc --noEmit` |
| Build | `npm.cmd run build` |
| Pruebas de BD | `npm.cmd run test:db` |
| Comprobar Supabase | `npm.cmd run check:supabase` |
| Validar configuración | `npm.cmd run check:config` |
| Comprobación completa local | `npm.cmd run check` |
| Variables de producción | `npm.cmd run check:release` |
| Tipos de Supabase | `supabase gen types typescript` → `src/lib/supabase/database.types.ts` |

## Reglas que nunca se rompen

- **No editar migraciones existentes** (pueden estar aplicadas en Supabase). Todo cambio va en una migración nueva con fecha posterior.
- **Aislamiento por negocio**: todo dato lleva `organization_id`, claves foráneas compuestas `(organization_id, id)` y RLS activado en todas las tablas. Nunca se mezclan datos de negocios distintos, aunque sean del mismo dueño.
- **Permisos en la base de datos** (RLS y funciones `security definer` con `set search_path = ''`), no solo ocultando botones. Revocar permisos por defecto y conceder solo las columnas necesarias.
- Visitas, premios y auditoría se modifican **solo mediante funciones RPC**, nunca con INSERT/UPDATE directos desde la app.
- Nunca usar `service_role` en la app ni poner secretos en `NEXT_PUBLIC_*`. `.env.local` fuera de Git.
- No registrar en logs DNI, celulares completos, tokens ni contraseñas.
- Dinero en `numeric(10,2)`; nunca `float` ni `number` para cálculos que se guardan. Los cálculos oficiales los hace la base de datos.
- No añadir dependencias sin necesidad (`zod` está permitido).

## Convenciones de código

- Antes de escribir código Next.js, lee la guía correspondiente en `node_modules/next/dist/docs/` (esta versión tiene cambios incompatibles; respeta las deprecaciones). Ver `AGENTS.md`.
- Server Components por defecto; Client Components solo para interacción.
- Mutaciones en Server Actions que validan la entrada, autorizan y usan `await createClient()` de `@/lib/supabase/server` (creado por solicitud).
- Cada página y Server Action del panel verifica sesión y membresía en el servidor; `proxy.ts` no sustituye esa verificación ni RLS.
- Validación compartida y pura en `src/lib/validation/` (DNI, celular, slug, URLs, dinero), usada en interfaz y servidor; la base de datos repite las reglas con CHECK.
- TypeScript estricto: sin `any` ni aserciones sin validar. Usar los tipos generados de Supabase.
- Cada llamada a Supabase revisa `error`. Mensajes al usuario en español que distinguen validación, permiso, duplicado (`23505`), conflicto y conexión; nunca mostrar SQL ni detalles internos.
- Mostrar dinero con `Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' })` y fechas en `America/Lima`.
- Nombres técnicos en inglés; textos de interfaz en español.
- Estructura: `src/app/(public)/`, `src/app/(auth)/`, `src/app/panel/`, `src/lib/supabase/`, `src/lib/validation/`, `src/lib/money.ts`, `src/components/`.

## Forma de trabajar

1. Trabaja **una etapa a la vez** (ver `docs/etapas.md`). No adelantes trabajo de etapas futuras.
2. Antes de escribir código, lee los documentos relevantes y propone un plan breve.
3. Los cambios del esquema incluyen migración nueva y pruebas PGlite. La etapa 8 no cambia el esquema: incluye diagnóstico administrativo de solo lectura probado con PGlite, landing, pulido y documentación operativa.
4. Antes de dar la etapa por terminada, deben pasar lint, tipos, build y `test:db`. Si algo falla, corrígelo; no lo ocultes ni desactives pruebas.
5. Al cerrar, reporta qué cambió, qué pruebas pasaron y qué SQL falta aplicar en Supabase remoto (las pruebas locales no lo verifican).
6. Actualiza la sección «Estado actual» de este archivo.

## Estado actual (01-oct-2026)

**Versión 2 completa en local (etapas 10 a 14), sin aplicar en Supabase remoto ni desplegar.** Pasos manuales en orden en `docs/v2-pasos-manuales.md`. **Inicio con sesión = `/barberias`** (`src/lib/home.ts`): el login lleva allí (o a `/aceptar-terminos` si faltan términos), y con sesión `/`, `/login` y `/registro` redirigen allí; el menú superior muestra «Mi panel», el logo del panel vuelve a `/barberias` y el menú «Cuenta» incluye «Mi panel». El SQL de las etapas 10 a 13 ya lo aplicó el usuario en Supabase. Pruebas: 218 de BD y 13 unitarias; lint, tipos y build correctos.

- **Etapa 12 (red pública)**: migración `20261001220000_network.sql` (`lat`/`lng`, `barbershop_slug_history` con triggers de historial y reserva, `private.barbershop_is_listed`, RPC anónimas `resolve_barbershop_slug`, `list_network_barbershops` y `list_network_districts`). App: `SiteHeader`/`SiteFooter` compartidos (`src/components/site-header.tsx`) en la landing (con bloque «Explorar barberías») y en `/barberias` (filas con scroll horizontal, buscador, cuadrícula paginada, semilla en cookie creada por `proxy.ts`), `BarbershopCard`, `src/lib/network.ts`, `src/lib/opening-hours.ts` (probado) y redirección 308 de slugs anteriores en `/b/[slug]`. 14 pruebas en `tests/db/network.test.mts`.
- **Etapa 13 («Mis visitas»)**: migración `20261001230000_my_visits.sql` (`customers.email`, `profiles.phone`, `save_my_profile`, `private.verified_email_since` en null = desactivado, `get_my_visits` solo agregados). App: correo opcional en alta/edición/ficha del cliente, `/panel/mis-visitas`, `/panel/perfil`, menú «Cuenta» (`account-menu.tsx`) y `/panel` orientado a cuentas normales. `supabase/enable-my-visits.sql` activa la vinculación después de habilitar «Confirm email». 10 pruebas en `tests/db/my-visits.test.mts`.
- **Etapa 14 (cierre)**: `tests/db/security-v2.test.mts` (RLS en todas las tablas, `anon` sin privilegios de tabla y solo 4 funciones, funciones públicas `security definer` con `search_path` vacío, privadas nuevas sin EXECUTE); `verify-release.sql` con 20 tablas, 23 RPC y 4 triggers.
- Revisión visual con páginas temporales de datos ficticios (borradas) a 390 y 1280 px: `/barberias` (filas y cuadrícula) y «Mis visitas»; se corrigió un desborde horizontal de las tarjetas. No se revisaron con datos reales ni con sesión, porque el remoto no tiene las migraciones.

**Etapa 11 (trabajadores multi-dueño) implementada en local, sin aplicar en Supabase remoto.** Migración `20261001210000_workers_multi_owner.sql`: se elimina el índice de un solo negocio activo; `private.assert_worker_owner_limit` y el trigger `organization_members_worker_owner_limit` limitan a 3 dueños distintos (`PT020`; dos negocios del mismo dueño cuentan uno; incluye negocios archivados); `assert_can_work_at` ya no lanza `PT004`/`PT005` por otros negocios y `create_business` ya no lanza `PT001` (un trabajador activo puede crear su negocio y un dueño Pro puede ser trabajador de otros). App: mensajes `PT020` (junto al correo) y `PT004` actualizados, textos del equipo, `/panel/nuevo` sin bloqueo para trabajadores, «Crear otra barbería» siempre visible, selector de barbería activa en el encabezado del panel (`src/app/panel/business-switcher.tsx`, solo con más de una barbería). Pruebas existentes de las reglas v1 reescritas a la regla nueva (`business`, `team`) y 9 nuevas en `tests/db/workers.test.mts`: 188 de BD y 10 unitarias; lint, tipos y build correctos. Selector revisado a 320 y 1280 px con una página temporal de datos ficticios (ya borrada); el panel autenticado no se revisó. SQL para el remoto: `supabase/setup-stage-11-workers.sql`, después de la etapa 10.

**Versión 2 en curso (red de barberías, `docs/red-barberias.md`).** Etapa 0 (documentos) y **etapa 10 (cuentas, Pro y términos) implementadas en local, sin aplicar en Supabase remoto.** Migración `20261001200000_accounts_pro_terms.sql`: `profiles` (términos aceptados, trigger `on_auth_user_created` en `auth.users`), `subscriptions` (por usuario, hoy `pro`/`active`/`free`), `private.is_pro` como único punto de control (exigido por `is_owner` y `can_operate_barbershop`), `private.grant_pro`, dueños existentes a Pro con condiciones de dueño pendientes, `create_business` de 4 parámetros (condiciones de dueño, `PT019`; la de 3 se eliminó), `accept_terms` y `get_my_account`. App: `src/lib/legal.ts` (versiones; una prueba verifica que coincidan con la BD), casilla obligatoria en `/registro` (envía `terms_version` en los metadatos), `/terminos` y `/privacidad` (texto provisional, enlazados desde la landing), `/aceptar-terminos` (protegida en `proxy.ts`), `requireAccount`/`getAccount` en `session.ts` (el panel y `getMyBusinesses` redirigen si faltan términos; `requireOwner`/`getOwnedBusiness` exigen Pro), condiciones de dueño en `/panel/nuevo`, botón «Crear» e insignia «Pro» en el menú del panel, `CheckboxField` en `ui.tsx`. `verify-release.sql` espera 19 tablas y 18 RPC. SQL para el remoto: `supabase/setup-stage-10-accounts-pro.sql`, **antes** de desplegar este código (sin `get_my_account` el panel falla). Pruebas: 179 de BD (19 nuevas en `tests/db/accounts.test.mts`, incluida la migración de dueños existentes) y 10 unitarias; lint, tipos y build correctos. Revisado en navegador a 320 px: registro (validación de la casilla sin crear cuentas), `/terminos`, `/privacidad` y redirección de `/aceptar-terminos` sin sesión. No se revisó el panel autenticado. Las reglas de trabajador de la v1 (`PT001`, `PT004`, un solo negocio) siguen hasta la etapa 11.

Preparación para GitHub: repositorio local inicializado en `main`, sin commit ni remoto todavía. `.gitignore` excluye variables reales, directorios `.env`, dependencias, compilaciones, credenciales, respaldos y configuración local de agentes. Solo `.env.example` puede versionarse como plantilla. Revisión de candidatos sin coincidencias de los patrones de claves comprobados. Guía de primer push y configuración de Vercel en `docs/github-vercel.md`; no se publicó ningún repositorio ni despliegue.

Revisión de reportes: corregida la validación de fechas para rechazar meses/días inválidos sin lanzar `RangeError` y romper la página; casos añadidos a las pruebas existentes. El archivo completo `setup-stage-9-reports.sql` se ejecutó con éxito en PGlite sobre las dependencias previas y se verificaron los permisos de ambas funciones. Pasaron lint, TypeScript, build, 160 pruebas de BD y 10 unitarias. No se aplicó el SQL al Supabase remoto.

**Etapa 9 (Reportes) implementada en local, sin aplicar en Supabase remoto.** Migración `20261001190000_reports.sql` (sin tablas ni índices nuevos): `get_business_report` (resumen del negocio y por quien atendió, importes como texto decimal) y `list_report_visits` (detalle paginado, 1–50 por página), ambas `security definer`, solo para el dueño activo (`private.is_owner`, antes que los filtros), sin `anon`; `private.report_range` valida fechas de Lima (2000–2100, desde ≤ hasta, ≤ 366 días) y el miembro filtrado. Solo visitas `completed`, estado vigente tras correcciones; unidades sumadas por visita antes de agrupar para no duplicar importes. Pantalla `/panel/[orgId]/reportes` (Server Component, formulario GET: hoy, semana lunes–domingo, mes, personalizado; filtro por miembro incluidos desactivados; período visible; resumen, por miembro y detalle paginado; carga, vacío y errores en español) y enlace «Reportes» solo en la navegación del dueño. El importe se llama «Total de servicios registrados». `src/lib/report-period.ts` (períodos en Lima, probado), `src/lib/reports.ts` (valida el JSON). `verify-release.sql` ahora espera 16 RPC. SQL para el remoto: `supabase/setup-stage-9-reports.sql`, después de las etapas 6 y 7. Pruebas: 160 de BD (10 nuevas en `tests/db/reports.test.mts`) y 10 unitarias; lint, tipos y build correctos; `/panel/…/reportes` sin sesión redirige (307). No se revisó la pantalla autenticada en navegador ni las funciones contra el Supabase remoto. Limitación conocida: los trabajadores conservan el SELECT por RLS sobre `visits` y `visit_items` de su negocio (necesario para la ficha e historial), así que podrían sumar datos por su cuenta; las funciones de reportes sí se lo impiden.

Identidad visual unificada como **Barber Field**, conservando el monograma `bf.` y el icono. Eslogan: «Cada experiencia cuenta. Una razón más para volver». Landing, autenticación, panel y página pública comparten paleta clara verde/marfil, botones y campos; CTA fijo a registro en landing y a registrar visita dentro del negocio, con espacio inferior reservado en móvil y escritorio. Cambios limitados a presentación; consultas, acciones, validaciones, enlaces existentes y Supabase conservados. Detalle en `docs/diseno.md`.

Verificación del cambio visual: lint, TypeScript, build, 150 pruebas de BD y 8 unitarias correctos. Comparación de archivos del backend sin cambios y comprobación de llamadas, destinos y manejadores existentes conservados. Revisión de landing/registro/login en navegador, sin desbordamiento horizontal a 320/390/1440 px; CTA fijo confirmado en móvil y escritorio. No se revisó visualmente el panel autenticado en esta sesión. Capturas en `docs/screenshots/barber-field-{landing,login}.png`.

Revisión de etapa 6: el formulario se reinicia por negocio/cliente para no reutilizar cantidades ni la clave de idempotencia entre clientes; el historial redirige a una página válida si la URL está fuera del rango. Corregida una prueba inestable que ordenaba emisión/canje por fecha y UUID: ahora verifica sus efectos y su vínculo con visita/premio. La prueba local no confirma concurrencia con conexiones reales ni el recorrido autenticado remoto.

**Etapas 1 a 8 implementadas en local.** Las etapas 1 a 3 fueron aplicadas por el usuario; la 4 y la 5 las dio por corregidas y aplicadas el usuario (01-oct-2026). Falta confirmar la aplicación remota de las etapas 6 y 7 (`setup-stage-6-loyalty-visits.sql` y `setup-stage-7-visit-corrections.sql`), verificar el esquema con `supabase/verify-release.sql` y probar el recorrido autenticado en desarrollo. El servicio de autenticación remoto responde; esto no verifica las RPC. La implementación de las etapas previstas está terminada; despliegue, separación real de entornos, concurrencia con conexiones reales y respaldo/restauración siguen pendientes de evidencia operativa. No habilitar visitas en producción hasta completar esas verificaciones.

Etapa 8: landing con navegación, registro/login, ejemplo ilustrativo y FAQ acordes al alcance; salto al contenido, foco de teclado, fuente Geist, carga y errores/404 en español, estados vacíos con orientación y campos de autenticación conservados en memoria ante errores (contraseñas nunca devueltas por el servidor). Revisión en navegador a 320/390/1440 px: sin desbordamiento, FAQ y enlaces funcionan, salto al contenido mueve el foco, validación del registro funciona sin crear cuentas. HTTP local: inicio/login/registro 200, 404 personalizada, panel redirige a login y cabeceras verificadas. Pasaron lint, tipos, build, 150 pruebas PGlite y 8 unitarias. Captura en `docs/screenshots/landing-desktop.jpg`.

Preparación operativa: `.env.example` documenta `APP_ENV`, `NEXT_PUBLIC_APP_URL` y `SUPABASE_PRODUCTION_PROJECT_REF`; `check:config` corre antes del build, rechaza claves administrativas y detecta destinos incompatibles cuando se declara la referencia de producción. `check:release` exige el destino productivo. Vercel tiene prioridad sobre `APP_ENV`. Panel/auth siempre noindex; desarrollo/Preview noindex y robots bloqueados. Cabeceras nosniff, anti-iframe, referrer y permisos, sin X-Powered-By. `verify-release.sql` es solo diagnóstico (17 tablas, 16 RPC con las de reportes, 2 índices y política de auditoría), no instalación. `docs/produccion.md` documenta respaldo de BD y Storage por separado y ensayo de restauración; no se configuró ningún backup remoto. Node mínimo 22.18 por scripts TypeScript; verificado con Node 24. No hay nueva migración en esta etapa.

Etapa 7: corrección con precios y términos históricos, motivo obligatorio, totales recalculados y progreso intacto; anulación de la última visita con reversión de puntos, emisión y canje. La RPC exige el ID de la visita para que los reintentos no anulen otra. Los ciclos reabiertos pueden emitir otro premio, conservando el anulado. Formularios con confirmación, bloqueo durante el envío y valores conservados ante errores. Auditoría del dueño con comparación antes/después. Pruebas locales: 149 de BD y 4 unitarias; PGlite no confirma concurrencia real ni el flujo remoto autenticado.

Existe:

- Migraciones:
  - `20260930120000_organizations_barbershops_memberships.sql`: `organizations`, `barbershops`, `organization_members`, `barbershop_members`, enum `member_role`, `private.is_active_member`, `private.is_owner`, `private.can_operate_barbershop`, trigger de dueño activo, RLS y permisos por columna.
  - `20261001120000_business_creation.sql`: columnas nuevas de `organizations` y `barbershops` (slug y datos de la página pública), sin INSERT directo ni `UPDATE (role)` en `organization_members`, índice de un solo trabajador activo y `public.create_business`.
  - `20261001130000_team.sql`: `add_worker_by_email`, `set_worker_active`, `list_team`; sin UPDATE directo en `organization_members`.
  - `20261001140000_services.sql`: `services`, `service_locations` (mantenida por triggers) y `reorder_services`.
  - `20261001150000_public_page.sql`: `business_hours`, `business_social_links`, `business_photos` (máx. 20), bucket `business-media` con políticas de Storage, CHECK de rutas de archivos, `save_business_hours`, `save_social_links` y `get_public_barbershop` (única función para `anon`).
  - `20261001160000_customers.sql`: `customers` (DNI único por negocio incluidos archivados, celular normalizado por trigger, consentimiento obligatorio con `consent_by = auth.uid()`, solo el dueño edita y archiva, sin DELETE) y `search_customers`.
  - `20261001170000_loyalty_visits.sql`: `loyalty_programs`, `loyalty_cycles`, `visits`, `visit_items`, `rewards`, `loyalty_events` y `audit_events` (solo SELECT por RLS; auditoría solo el dueño; eventos y auditoría de solo inserción por trigger), `save_loyalty_program` (audita), `register_visit` (idempotencia, bloqueos, ciclo, premio, reparto del descuento), `get_customer_loyalty`, `private.apply_reward_discount` (reutilizable en la etapa 7) y `loyalty_text` en `get_public_barbershop`.
  - `20261001180000_visit_corrections.sql`: `correct_visit`, `void_last_visit`, snapshot privado para auditoría, un premio no anulado por ciclo y una reversión por evento original; sin nuevos permisos de escritura directa.
  - `20261001190000_reports.sql`: `get_business_report`, `list_report_visits` y `private.report_range` (etapa 9, solo lectura, solo el dueño).
  - Códigos de error propios `PT001`–`PT018`: ver `docs/modelo-datos.md` y `src/lib/supabase/errors.ts`.
- Pruebas: `tests/db/{organizations,business,team,services,public-page,customers,loyalty-visits,reports,release}.test.mts` (160; diagnóstico final detecta también falta de permisos de una RPC). `test-database.mts` emula `auth.users` (con `email`) y el esquema `storage`. PGlite usa una sola conexión: la concurrencia real de `register_visit`, `correct_visit` y `void_last_visit` (bloqueos) no se puede ejecutar en paralelo; se prueban efectos, reintentos y restricciones únicas. Unitarias en `tests/unit/` (`npm.cmd run test:unit`): paginación, vista previa del total, destinos/variables de despliegue y períodos de reportes (10).
- `src/lib/supabase/database.types.ts` **escrito a mano** (no hay CLI instalado); regenerarlo con `supabase gen types` cuando sea posible.
- `src/lib/session.ts` (`requireUser`, `getMyBusinesses`, `requireMembership`, `requireOwner`, `getOwnedBusiness`, `getMemberBusiness`), `src/lib/money.ts`, `src/lib/dates.ts`, `src/lib/media.ts` (rutas y URL pública), `src/lib/images.ts` (redimensionar en el navegador), `src/lib/public-barbershop.ts` (lee y valida `get_public_barbershop`), `src/lib/loyalty.ts` (valida `get_customer_loyalty` y describe el premio), `src/lib/customer-loyalty.ts` (servidor), `src/lib/visit-preview.ts` (total estimado en céntimos, solo para mostrar), `src/lib/idempotency.ts` (clave generada en el navegador), `src/lib/validation/{auth,business,slug,money,service,uuid,phone,url,page,hours,customer,loyalty,visit}.ts`, `src/components/{ui,action-button}.tsx`.
- `src/proxy.ts` protege `/panel/*` y redirige `/login` y `/registro` a `/panel` con sesión.
- Pantallas: `/` (landing completa: funciones, pasos, preguntas y acceso a registro/login), `/registro`, `/login`, `/panel` (selector), `/panel/nuevo`, `/panel/[orgId]` (inicio: registrar visita, aviso si falta el premio, visitas de hoy y premios pendientes), `/panel/[orgId]/equipo` y `/panel/[orgId]/pagina` (solo dueño), `/panel/[orgId]/servicios` (dueño edita; trabajador solo lectura), `/panel/[orgId]/clientes` (búsqueda paginada; archivados solo el dueño), `/panel/[orgId]/clientes/nuevo` (consentimiento, aviso de DNI existente y de celular repetido), `/panel/[orgId]/clientes/[customerId]` (ficha con progreso, premios pendientes, confirmación del registro e historial paginado; el dueño edita y archiva), `/panel/[orgId]/premio` (dueño configura; trabajador solo lectura), `/panel/[orgId]/visitas/nueva` (buscar cliente → progreso y última visita → servicios y cantidades → atendido por → aviso de premio con elección obligatoria o premio pendiente → total estimado) y `/b/[slug]` (pública, con Open Graph y el texto del premio si la promoción está activa). `next.config.ts` permite imágenes del bucket público de Supabase. El layout de `/panel/[orgId]` verifica la membresía y oculta al trabajador los enlaces del dueño.
- Etapa 7 añade `src/lib/validation/visit-correction.ts`, acciones `visitas/correction-actions.ts`, `/panel/[orgId]/visitas/[visitId]/corregir` (corrección y anulación), acceso desde la ficha del cliente y `/panel/[orgId]/auditoria` (solo dueño, paginada, autor, fecha, motivo y estados).
- Etapa 9 añade `/panel/[orgId]/reportes` (solo dueño) con `loading.tsx`, `src/lib/report-period.ts` y `src/lib/reports.ts`.
- `prepare:supabase` genera `supabase/setup-stage-1.sql`, `setup-stage-1-business.sql`, `setup-stage-2-team.sql`, `setup-stage-3-services.sql`, `setup-stage-4-public-page.sql`, `setup-stage-5-customers.sql`, `setup-stage-6-loyalty-visits.sql`, `setup-stage-7-visit-corrections.sql` y `setup-stage-9-reports.sql` (la etapa 8 no tiene migración).

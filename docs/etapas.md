# Etapas de implementación y pruebas

## Etapas

Trabajar una etapa a la vez. Cada cambio del esquema incluye migración nueva y pruebas PGlite. La etapa 8 no cambia el esquema: incluye un diagnóstico administrativo de solo lectura, probado con PGlite, además de landing, pulido y guía operativa. Todas las etapas deben pasar `npm.cmd run lint`, `npx tsc --noEmit`, `npm.cmd run build` y `npm.cmd run test:db`.

Al final de cada etapa:

- reportar qué se cambió, qué pruebas pasaron y qué falta aplicar en Supabase remoto (las pruebas locales no verifican el remoto);
- actualizar la sección «Estado actual» de `CLAUDE.md`.

1. **Cuentas y negocios**:
   - migración con columnas nuevas de `organizations` y `barbershops`, revocación de inserción directa en `organization_members`, índice de trabajador único y `create_business`;
   - pantallas de registro, login, `/panel` (selector) y `/panel/nuevo`;
   - protección en `proxy.ts`;
   - layout del panel con cierre de sesión.
2. **Equipo**: `add_worker_by_email`, `set_worker_active`, `list_team`; pantalla de equipo; permisos de trabajador en el layout.
3. **Servicios y precios**: `services`, `service_locations` y la pantalla de gestión.
4. **Página pública**:
   - `business_hours`, `business_social_links`, `business_photos`, bucket y políticas de Storage, `get_public_barbershop`;
   - pantallas `/panel/[orgId]/pagina` y `/b/[slug]`, con metadatos Open Graph.
5. **Clientes**: tabla `customers`, validaciones, consentimiento, búsqueda, ficha, y edición y archivado por el dueño.
6. **Premio y visitas**:
   - tablas: `loyalty_programs`, `loyalty_cycles`, `visits`, `visit_items`, `rewards`, `loyalty_events` y `audit_events`;
   - funciones: `register_visit` y `get_customer_loyalty`;
   - pantallas: configuración del premio, registro de visita con aviso de premio y progreso en la ficha.
7. **Corrección y anulación**: `correct_visit`, `void_last_visit`, sus pantallas y `/auditoria`.
8. **Landing y pulido**: landing real, accesibilidad, estados vacíos y preparación para producción (entornos separados, respaldo).

La etapa 8 incluye navegación a funciones, pasos y preguntas, acceso a registro/login,
ejemplo explícitamente ilustrativo, navegación por teclado, estados de carga,
404 y errores en español; `check:config`, `check:release`, `verify-release.sql` y
`docs/produccion.md`. No agrega comunicaciones ni cambia reglas de negocio.

9. **Reportes** (solo el dueño): `get_business_report` y `list_report_visits` en una migración nueva, sin tablas nuevas; pantalla `/panel/[orgId]/reportes` con filtros por período en `America/Lima` y por trabajador, resumen del negocio, resumen por quien atendió y detalle paginado. No incluye pagos, gastos, comisiones ni cierres de caja.

No habilitar el registro de visitas en producción hasta completar las etapas 6 y 7 con sus pruebas.

## Pruebas mínimas

Por cada etapa, en `tests/db/` (PGlite, usando `createTestDatabase` y `runAs`):

- **Seguridad**:
  - un anónimo no lee ninguna tabla y solo ejecuta `get_public_barbershop`;
  - un usuario de otro negocio, aunque sea del mismo dueño o conozca los IDs, no ve ni modifica nada;
  - un miembro desactivado pierde acceso;
  - un trabajador no edita servicios, premio, página, equipo ni clientes, y no lee la auditoría;
  - nadie inserta directamente en `visits`, `rewards`, `loyalty_*`, `audit_events` ni `organization_members`;
  - solo el dueño sube o borra archivos en la carpeta de su negocio en Storage.
- **Negocios**:
  - el alta es atómica;
  - un mismo usuario puede crear varios negocios;
  - un trabajador activo no puede crear un negocio;
  - se rechaza sin sesión y con slug duplicado.
- **Equipo**:
  - agregar por correo existente funciona y asigna el local;
  - se rechaza un correo inexistente;
  - se rechaza a un trabajador activo de otro negocio y a un dueño de otro negocio;
  - se rechaza la reactivación si ya trabaja en otro negocio.
- **Clientes**:
  - se acepta un DNI de 8 dígitos con ceros iniciales;
  - se rechazan DNI y celular inválidos, o faltantes;
  - el celular se guarda normalizado;
  - se rechaza un DNI duplicado en el mismo negocio (aunque esté archivado) y se permite en otro negocio;
  - se permite un celular repetido;
  - se rechaza sin consentimiento;
  - un trabajador crea clientes pero no los edita.
- **Servicios**:
  - se rechaza un precio negativo;
  - cambiar el precio no altera visitas anteriores;
  - un servicio archivado no se registra.
- **Página pública**:
  - un local no publicado devuelve `null`;
  - no incluye servicios no publicados o archivados ni datos de clientes;
  - se rechaza el horario con cierre antes de la apertura y más de 2 rangos por día;
  - se rechaza una URL de red o de mapa que no sea `https`;
  - se rechaza la foto número 21.
- **Premio**:
  - meta por defecto 5 y metas distintas (1, 5, 10);
  - una visita con varios servicios suma 1;
  - en la visita N con «aplicado» el premio queda `redeemed` en esa visita y el ciclo nuevo arranca en 0;
  - con «después» queda `available` y se aplica en una visita posterior;
  - `p_apply_earned_reward = true` fuera de la visita N da conflicto;
  - los cuatro tipos de premio, con redondeo y tope;
  - con `fixed_discount` mayor al subtotal el total queda en 0;
  - `custom_benefit` tiene descuento 0;
  - un premio por visita y nunca dos veces el mismo;
  - `free_service` sin ese servicio en la visita se rechaza;
  - editar la promoción no cambia ciclos abiertos ni premios emitidos;
  - una promoción pausada no suma pero permite aplicar premios pendientes;
  - sin promoción configurada no se registran visitas.
- **Idempotencia y concurrencia**:
  - la misma clave con los mismos datos devuelve la misma visita;
  - la misma clave con datos distintos da conflicto;
  - dos visitas simultáneas del mismo cliente cerca de la meta no emiten dos premios ni pierden progreso.
- **Corrección**:
  - cambia las líneas y recalcula los totales y el descuento del premio aplicado;
  - conserva los precios congelados de las líneas que se mantienen;
  - no cambia el progreso;
  - exige motivo y queda en auditoría;
  - quitar el servicio de un `free_service` aplicado se rechaza;
  - un trabajador puede corregir.
- **Anulación**:
  - solo la última visita;
  - revierte el punto;
  - si la visita completó un ciclo, lo reabre en N-1 y anula el premio emitido;
  - se rechaza si ese premio ya se aplicó en una visita posterior;
  - un premio pendiente aplicado vuelve a `available`;
  - repetirla no duplica efectos;
  - un trabajador puede anular.

- **Reportes**:
  - varias líneas por visita y cantidades mayores que uno: una visita, unidades por cantidad;
  - los importes no se duplican al unir con las líneas;
  - descuentos de premios, visitas anuladas excluidas y corregidas con sus datos actuales;
  - el dueño y los trabajadores desactivados aparecen con su actividad; filtro por trabajador;
  - límites del día en `America/Lima` (23:59:59 y 00:00 locales);
  - trabajadores, anónimos, desactivados y otros negocios (incluso del mismo dueño) no obtienen reportes;
  - se rechazan períodos y paginación inválidos.

Probar también en la interfaz, contra un proyecto Supabase de desarrollo (nunca producción), el flujo principal: registro → crear negocio → servicios → premio → página pública con fotos → agregar trabajador → el trabajador registra un cliente y 5 visitas → aviso y premio aplicado → corrección → anulación.

## Versión 2: red de barberías

Reglas en `docs/red-barberias.md`. Mismas condiciones de cierre que las etapas anteriores.

10. **Cuentas, Pro y términos**: `profiles`, `subscriptions`, `private.is_pro` (único punto de control, exigido por `is_owner` y `can_operate_barbershop`), dueños existentes a Pro, `create_business` con condiciones de dueño, `accept_terms`, `get_my_account`; casilla en registro, `/terminos`, `/privacidad`, `/aceptar-terminos` y botón «Crear» en el menú del panel. Pruebas: los dueños existentes son Pro; sin Pro no hay acciones de dueño; crear exige las condiciones vigentes; versión distinta da `PT019`; nadie escribe directamente en las tablas nuevas; cada usuario solo ve lo suyo.
11. **Trabajadores multi-dueño**: hasta 3 dueños distintos (trigger), compatible con ser dueño, selector de local activo. Pruebas: 3 dueños sí y el cuarto no (`PT020`); dos negocios del mismo dueño cuentan uno; desactivados no cuentan y reactivar valida; el trigger cubre escrituras directas; aislamiento entre negocios del mismo trabajador; un dueño Pro puede ser trabajador sin acciones de dueño en el negocio ajeno; un trabajador activo crea su negocio.
12. **Red pública y URLs**: `lat`/`lng`, historial de slugs con redirección, requisitos de listado calculados, RPC anónima de tarjetas, `/barberias` con menú compartido y enlace desde la landing. Pruebas: solo locales que cumplen los requisitos y se recalcula al cambiar servicios, publicación o archivo; búsqueda por nombre, distrito y servicio publicado; orden aleatorio estable que no repite al paginar; parámetros inválidos; tarjetas sin datos internos; redirección y reserva de slugs; coordenadas.
13. **Mis visitas**: `customers.email`, celular en el perfil, función de agregados vinculada por correo confirmado. Pruebas: desactivado hasta la activación; sin verificar o autoconfirmado no vincula; agregados correctos sin DNI, celular, nombre ni IDs; anuladas no cuentan y archivados no aparecen; el cliente no lee tablas de negocio; celular normalizado.
14. **Cierre**: revisión de RLS de tablas nuevas y modificadas, pruebas de que nada privado es público (`tests/db/security-v2.test.mts`: RLS en todas las tablas, `anon` sin privilegios de tabla y solo 4 funciones, funciones públicas `security definer` con `search_path` vacío), `verify-release.sql` (20 tablas, 23 RPC, 4 triggers) y `docs/v2-pasos-manuales.md`.

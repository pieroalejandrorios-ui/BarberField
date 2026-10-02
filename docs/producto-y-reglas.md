# Producto y reglas de negocio

Qué hace el producto, quién puede hacer qué y las reglas que la base de datos y la interfaz deben cumplir. El modelo de datos que las implementa está en `docs/modelo-datos.md`.

## Qué es el producto

Plataforma web donde cualquier persona crea una cuenta y registra la barbería de la que es dueña. Funciones:

1. **Cuentas**: registro e inicio de sesión con correo y contraseña.
2. **Negocios**: cualquier usuario puede crear uno o varios negocios (barberías) de los que es dueño.
3. **Equipo**: el dueño agrega trabajadores con su correo. Un trabajador pertenece a una sola barbería.
4. **Clientes**: el dueño y los trabajadores registran clientes con nombre, DNI y celular.
5. **Visitas**: el dueño y los trabajadores registran visitas indicando servicios, precios y quién atendió. También pueden corregirlas o anularlas.
6. **Premio por fidelidad**: cada N visitas (5 por defecto; el dueño puede cambiar N) el cliente gana un premio que define el dueño: descuento o servicio especial. En la visita N el sistema avisa, quien registra marca que el premio se aplicó y el conteo vuelve a 0.
7. **Página pública personalizable**: descripción, logo, portada, galería de fotos, servicios con precios, horario de atención, redes sociales y contacto, y enlace de ubicación (Google Maps).
8. **Reportes** (solo el dueño): visitas, unidades de servicios, subtotal, descuentos y «Total de servicios registrados» del negocio y por quien atendió, por período, con el detalle de las visitas.

Público objetivo: barberías pequeñas en Perú. Interfaz en español, moneda PEN, zona horaria `America/Lima`. Diseño mobile first, porque el dueño y los trabajadores usan el celular en el local.

### Fuera del alcance de la primera versión (no implementar)

- Verificación de correo y recuperación de contraseña.
- Pagos y suscripción del SaaS. La plataforma es gratis por ahora, pero en el futuro se cobrará por registrar un negocio. El negocio (`organizations`) es la unidad que se cobrará: no tomar decisiones que lo impidan.
- Envío de mensajes (WhatsApp, SMS, correo) a clientes, incluido el aviso de premio. El celular solo se guarda.
- Consulta pública del cliente («¿cuántas visitas llevo?» por DNI).
- Personalización de colores o tema de la página pública: todas las páginas usan el mismo diseño.
- Cumpleaños de clientes.
- Reservas o citas, facturación electrónica, inventario, propinas y comisiones.
- Varios locales por negocio en la interfaz: el modelo los admite, pero cada negocio tiene un solo local en la v1. Un dueño con dos locales crea dos negocios.
- Varias promociones activas a la vez.

## Roles y permisos

| Acción | Dueño (`owner`) | Trabajador (`barber`) |
| --- | --- | --- |
| Crear cuenta e iniciar sesión | Sí | Sí |
| Crear negocios | Sí, varios | No, mientras sea trabajador activo de otro negocio |
| Editar página pública (textos, fotos, horario, redes, ubicación, publicar) | Sí | No |
| Crear, editar y archivar servicios y precios | Sí | Solo consultar |
| Configurar el premio (N visitas y recompensa) | Sí | Solo consultar |
| Agregar y desactivar trabajadores | Sí | No |
| Registrar clientes | Sí | Sí |
| Buscar clientes y ver ficha, progreso e historial | Sí | Sí |
| Editar o archivar clientes | Sí | No |
| Registrar visitas y aplicar premios | Sí | Sí |
| Corregir visitas (servicios, cantidades, quién atendió) | Sí, con motivo | Sí, con motivo |
| Anular la última visita de un cliente | Sí, con motivo | Sí, con motivo |
| Ver historial de auditoría | Sí | No |
| Ver reportes del negocio y por trabajador | Sí | No |

- Los permisos se aplican en la base de datos (RLS y funciones), no solo ocultando botones.
- Un miembro desactivado pierde acceso aunque su sesión siga abierta.
- Un usuario puede ser **trabajador activo de un solo negocio** y, mientras lo sea, no puede ser dueño de otro (ni crear uno). Esto se valida en la base de datos.
- Un dueño puede tener varios negocios. Cada negocio está completamente aislado: no comparte clientes, visitas, servicios ni premios con otros, aunque sean del mismo dueño.

## Reglas de negocio

### Cuentas

- Supabase Auth con correo y contraseña (mínimo 8 caracteres). En Supabase está **desactivado** «Confirm email»: el usuario entra al registrarse.
- Sin recuperación de contraseña en la v1. Si alguien la olvida, el administrador la restablece manualmente desde el panel de Supabase.
- Al iniciar sesión:
  - Si el usuario no tiene negocios, ve «Crear mi barbería» y un aviso: «Si eres trabajador, pide al dueño que te agregue con tu correo (correo@…)».
  - Si tiene exactamente uno, entra directo a su panel.
  - Si tiene varios, elige con cuál trabajar.

### Negocio y local

- Al crear un negocio se crean de forma atómica `organizations`, la membresía `owner` y su único local (`barbershops`). Datos que se piden: nombre de la barbería, dirección y slug.
- El nombre del negocio y el del local son el mismo en la interfaz (se guardan en ambas tablas). El dueño puede archivar un negocio; nunca se borra.

### Equipo

- El dueño escribe el correo del trabajador. **La cuenta debe existir**: el trabajador se registra primero. Si el correo no existe, mostrar: «No hay una cuenta con ese correo. Pide al trabajador que se registre primero».
- La función rechaza al usuario si ya es trabajador activo de otro negocio, si es dueño de algún negocio activo o si es el propio dueño.
- Al agregarlo, se crea la membresía `barber` y se asigna automáticamente al único local.
- El dueño puede desactivar y reactivar trabajadores. No se borran, porque sus visitas registradas los referencian. Al reactivar se vuelve a validar la regla de un solo negocio.

### Clientes

- Todos obligatorios:
  - Nombre completo: 1–120 caracteres.
  - DNI: exactamente 8 dígitos, guardado como texto para conservar los ceros iniciales.
  - Celular: el usuario escribe 9 dígitos que empiezan en 9 (acepta espacios o el prefijo +51). Se guarda normalizado como `+519XXXXXXXX`.
- El DNI es único dentro del mismo negocio, incluidos los clientes archivados. Si ya existe, la interfaz muestra ese cliente en lugar de crear un duplicado. El mismo DNI puede existir en negocios distintos, sin relación entre ellos.
- El celular no es único (familiares pueden compartirlo). Si ya existe, la interfaz muestra un aviso, pero permite continuar.
- **Consentimiento (Ley 29733)**: casilla obligatoria «El cliente autorizó el registro de sus datos personales». Se guardan la fecha y el usuario que la marcó. Sin consentimiento no se guarda el cliente.
- Solo el dueño edita y archiva clientes. Los clientes no se borran, para conservar su historial. Un cliente archivado no recibe visitas nuevas.
- Validar en la interfaz, en el servidor (Server Action) y en la base de datos (CHECK).

### Servicios y precios

- Cada servicio tiene:
  - nombre (1–80);
  - descripción opcional (≤ 300);
  - precio en PEN (`numeric(10,2)`, ≥ 0; nunca `float`);
  - duración en minutos, opcional (> 0);
  - si se muestra en la página pública (`is_published`);
  - orden de presentación.
- El dueño crea, edita, reordena y archiva servicios. Cambiar el nombre o el precio **no** modifica visitas pasadas, porque cada visita guarda una copia del nombre y del precio.
- Un servicio archivado no se puede usar en visitas nuevas ni en correcciones.

### Visitas

- Una visita es un cliente atendido en un momento, con uno o más servicios (cada uno con cantidad) y el miembro que lo atendió (`attended_by`, por defecto quien registra; puede elegirse otro miembro activo).
- La fecha la pone el servidor (`now()`). No hay visitas retroactivas.
- Se guardan subtotal, descuento y total. Por cada línea se guardan servicio, copia del nombre y del precio unitario, cantidad, bruto, descuento y neto.
- Doble envío: cada registro lleva una clave de idempotencia generada en el navegador. Repetir la misma clave devuelve la visita ya creada.
- **Corregir** (dueño o trabajador, con motivo obligatorio): permite cambiar los servicios, las cantidades y quién atendió en cualquier visita completada. Reglas:
  - No cambia el cliente; para eso se anula la visita y se registra de nuevo.
  - Los precios de las líneas que se mantienen conservan su copia. Las líneas nuevas toman el precio actual.
  - Si la visita aplicó un premio, el descuento se recalcula con los términos congelados del premio. Si es `free_service` y la corrección quita ese servicio, se rechaza.
  - No cambia el conteo de visitas.
  - El estado anterior completo queda en `audit_events`.
- **Anular** (dueño o trabajador, con motivo obligatorio): solo la **última** visita completada del cliente. Revierte su efecto en el premio (ver abajo). Las visitas anuladas se conservan, marcadas como `voided`.

### Premio por fidelidad

Configuración: una promoción por negocio, editable solo por el dueño.

- `visits_required`: número de visitas para ganar el premio, un entero entre 1 y 50. **Por defecto 5.**
- Tipo de premio, uno de:
  - `free_service`: un servicio de la lista, gratis (p. ej. «Corte clásico»).
  - `percent_discount`: porcentaje de descuento (> 0 y ≤ 100) sobre el subtotal de la visita.
  - `fixed_discount`: monto fijo en PEN (> 0), como máximo el subtotal.
  - `custom_benefit`: servicio o beneficio especial descrito en texto libre por el dueño (p. ej. «Lavado + mascarilla gratis»). No calcula un descuento automático.
- Texto público (≤ 200), p. ej. «Cada 5 visitas, tu corte es gratis». Se muestra en la página pública.
- Estado: activa o pausada. Si está pausada, las visitas no suman, pero los premios pendientes se pueden aplicar.
- Mientras el dueño no configure el premio, no se pueden registrar visitas. El panel muestra el aviso «Configura tu premio por fidelidad para empezar a registrar visitas» (al trabajador: «El dueño aún no configuró el premio»).

Funcionamiento:

1. **Toda visita completada suma 1** al ciclo del cliente, sin importar cuántos servicios tenga.
2. **Ciclo**: cada cliente tiene un ciclo abierto. Al empezar un ciclo se **copian** las reglas vigentes (meta y premio). Si el dueño edita la promoción, los ciclos abiertos terminan con sus reglas originales y los nuevos usan las nuevas. Nunca se recalcula el progreso por editar la promoción.
3. **Aviso**: al elegir el cliente en «Registrar visita», la interfaz muestra «Visita X de N». Si esta visita completa el ciclo, muestra un aviso destacado: «Esta es la visita N: corresponde el premio "…"».
4. **Ganar y aplicar en la misma visita**: la visita que completa el ciclo cierra el ciclo, emite el premio y abre uno nuevo en 0, todo en la misma transacción. Quien registra **debe** marcar una opción antes de confirmar:
   - «Premio aplicado en esta visita» (opción por defecto): el premio queda `redeemed` en esa misma visita y se aplica el descuento si corresponde.
   - «El cliente lo usará después»: el premio queda `available` (pendiente) y se puede aplicar en cualquier visita posterior.
5. **Premios pendientes**: la ficha del cliente y el registro de visita muestran los premios `available`. Se aplican eligiéndolos explícitamente; nunca se aplican solos. Máximo un premio por visita.
6. **Cálculo del descuento**:
   - `free_service`: la visita debe incluir ese servicio; se descuenta una unidad a su precio en esa visita.
   - `percent_discount`: porcentaje sobre el subtotal, redondeado a 2 decimales.
   - `fixed_discount`: `min(monto, subtotal)`; el sobrante se pierde (la interfaz avisa antes).
   - `custom_benefit`: descuento 0; el beneficio se entrega fuera del sistema y solo queda constancia de que se aplicó.
   - El descuento se reparte entre las líneas en orden estable; el ajuste por redondeo va a la última línea. Nunca supera el subtotal ni deja montos negativos.
7. **Consistencia**: si la interfaz envía «aplicar premio ganado» pero en el servidor la visita ya no completa el ciclo (otro registro simultáneo), la función rechaza con un error de conflicto y la interfaz vuelve a consultar el progreso.
8. **Anular la última visita** revierte el punto que sumó. Si esa visita completó un ciclo, el ciclo se reabre en N-1, el ciclo nuevo vacío se marca `voided` y el premio emitido se anula, siempre que no se haya aplicado en una visita *posterior* (en ese caso, la anulación se rechaza). Si la visita aplicó un premio pendiente, ese premio vuelve a `available`.
9. Todo cambio de progreso queda en `loyalty_events` (suma, emisión, canje, reversión). El progreso nunca se modifica desde el navegador.

### Reportes

- Solo el dueño activo del negocio. Las funciones de la base de datos rechazan a trabajadores, anónimos y usuarios de otros negocios aunque conozcan el ID.
- Indicadores: visitas completadas, unidades de servicios (suma de cantidades), subtotal antes de descuentos, descuentos aplicados y **Total de servicios registrados** (subtotal − descuentos). No se llama «dinero cobrado», «ingresos» ni «utilidad»: no se registran pagos ni gastos.
- Se calculan con las visitas y sus líneas guardadas (precios históricos). Las anuladas no cuentan; las corregidas cuentan con sus servicios, cantidades, importes y «atendido por» actuales, en la fecha original de la visita.
- Una visita con varios servicios cuenta como una visita. Los importes son los de la visita; las líneas solo aportan las unidades, sin duplicar subtotales ni descuentos.
- Resumen del negocio y uno por quien atendió, incluido el dueño y los trabajadores desactivados con actividad. Filtro por miembro (también desactivados).
- Períodos: hoy, semana actual (lunes a domingo), mes actual o fechas personalizadas, siempre como fechas de calendario en `America/Lima`, ambas incluidas, hasta 366 días.
- Detalle paginado (20 por página) de las visitas que forman los totales, con cliente (solo nombre), quién atendió, líneas e importes.
- Los cálculos los hace PostgreSQL con `numeric`; la interfaz solo los muestra en PEN.
- Fuera del alcance: pagos, gastos, comisiones, cierres de caja y exportaciones.

### Página pública

- URL: `/b/[slug]`. El sistema propone el slug a partir del nombre y el dueño puede cambiarlo. Formato: minúsculas, números y guiones, de 3 a 60 caracteres, único en toda la plataforma.
- Contenido editable por el dueño:
  - Nombre y descripción (≤ 1000, con saltos de línea, sin HTML).
  - **Logo** y **foto de portada** (una de cada).
  - **Galería** de hasta 20 fotos, con leyenda opcional (≤ 120) y orden.
  - **Servicios publicados** con precio y duración.
  - **Horario de atención** por día de la semana: cerrado o hasta 2 rangos (p. ej. 9:00–13:00 y 15:00–21:00), más una nota opcional (≤ 200, p. ej. «Feriados consultar»).
  - **Contacto**: teléfono/WhatsApp del local y **redes sociales** (Instagram, Facebook, TikTok, YouTube, X, sitio web), cada una con su URL `https`. El WhatsApp se muestra como enlace `https://wa.me/51…`.
  - **Ubicación**: dirección, distrito/ciudad y URL de Google Maps (`https`, dominios `google.com/maps`, `maps.google.com`, `maps.app.goo.gl` o `goo.gl/maps`). Se muestra como botón «Cómo llegar»; no se incrusta un mapa en la v1.
  - Texto público del premio, si la promoción está activa.
- Fotos:
  - Solo JPG, PNG o WebP, de hasta 5 MB cada una.
  - En el navegador se redimensionan antes de subir: lado mayor de 1600 px para la galería y la portada, 512 px para el logo.
  - Se guardan en Supabase Storage (ver «Storage» en `docs/modelo-datos.md`).
- La página solo es visible si el dueño la publica (`is_published`). Nunca expone clientes, visitas, miembros ni datos internos.
- Los usuarios anónimos solo acceden a través de la función pública `get_public_barbershop`; no leen tablas directamente.
- Metadatos para compartir: título, descripción e imagen de portada (Open Graph).

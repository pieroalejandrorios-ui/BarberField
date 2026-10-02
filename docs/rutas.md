# Pantallas y rutas

> Rutas de la versión 2 al final de la tabla. Reglas en `docs/red-barberias.md`.

Todas en español, mobile first y accesibles (etiquetas, foco, contraste). Sin doble envío y conservando lo escrito si algo falla.

| Ruta | Contenido | Acceso |
| --- | --- | --- |
| `/` | Con sesión redirige a `/barberias` (inicio). Sin sesión: landing del producto: qué hace y botones «Crear cuenta» / «Iniciar sesión». Sin precios, testimonios ni métricas inventadas. | Público |
| `/registro` | Correo, contraseña (mín. 8) y confirmación. `signUp` sin verificación de correo. | Público |
| `/login` | Correo y contraseña. | Público |
| `/panel` | Sin negocios: «Crear mi barbería» y el aviso para trabajadores. Un negocio: redirige a `/panel/[orgId]`. Varios: lista para elegir. Desde la etapa 11, con más de una barbería el encabezado del panel muestra un selector de barbería activa (la de la URL). El menú tiene «Crear». | Autenticado |
| `/panel/nuevo` | Crear negocio: nombre, dirección, slug (propuesto automáticamente) y condiciones de dueño → `create_business`; la cuenta pasa a Pro. | Autenticado |
| `/panel/[orgId]` | Resumen: visitas de hoy, clientes con premio pendiente, acceso rápido a «Registrar visita» y, si falta, el aviso para configurar el premio. | Miembro |
| `/panel/[orgId]/clientes` | Búsqueda por nombre, DNI o celular; paginado; filtro de archivados (solo el dueño). | Miembro |
| `/panel/[orgId]/clientes/nuevo` | Nombre, DNI, celular y casilla de consentimiento. | Miembro |
| `/panel/[orgId]/clientes/[id]` | Ficha con datos, «3 de 5 visitas», premios pendientes e historial de visitas paginado, con «Corregir» y «Anular última visita». El dueño puede además editar y archivar. | Miembro |
| `/panel/[orgId]/visitas/nueva` | Buscar o crear cliente → ver progreso y la última visita (para evitar duplicados) → elegir servicios y cantidades → «Atendido por» → ver total. Si es la visita N, aviso de premio y elección obligatoria (aplicado ahora o después); si no, opción de aplicar un premio pendiente → confirmar. | Miembro |
| `/panel/[orgId]/visitas/[visitId]/corregir` | Servicios y cantidades con precios históricos, miembro que atendió, total estimado y motivo obligatorio. Anulación con motivo y confirmación solo si es la última completada. Visitas anuladas no se editan. | Miembro |
| `/panel/[orgId]/servicios` | Lista ordenable; crear y editar nombre, precio, duración y si se publica; archivar. | Dueño (trabajador solo lectura) |
| `/panel/[orgId]/premio` | Configurar visitas requeridas (5 por defecto), tipo y valor del premio, y texto público; activar o pausar. Aviso: «Los cambios aplican a ciclos nuevos; los clientes con progreso conservan sus reglas actuales». | Dueño (trabajador solo lectura) |
| `/panel/[orgId]/pagina` | Editar descripción, logo, portada, galería, horario, contacto, redes, ubicación y slug; publicar o despublicar; botón «Ver página pública». | Dueño |
| `/panel/[orgId]/equipo` | Agregar trabajador por correo, lista con estado, desactivar o reactivar. | Dueño |
| `/panel/[orgId]/auditoria` | Correcciones y anulaciones con motivo, autor y fecha. | Dueño |
| `/panel/[orgId]/reportes` | Filtros por período (`periodo=hoy\|semana\|mes\|personalizado`, `desde`, `hasta`) y miembro (`trabajador`), período visible, resumen del negocio, resumen por quien atendió y detalle paginado (`pagina`). Formulario GET sin JavaScript. | Dueño (para el trabajador la ruta no existe) |
| `/b/[slug]` | Página pública (Server Component, usa `get_public_barbershop`). Un slug anterior redirige (308) al actual con `resolve_barbershop_slug`. | Público |
| `/terminos` y `/privacidad` | Términos y Política de Privacidad (texto provisional). | Público |
| `/aceptar-terminos` | Aceptar la versión vigente de los términos y, si es Pro, las condiciones de dueño. El panel redirige aquí mientras falten. | Autenticado |
| `/barberias` | Red pública (etapa 12): menú compartido con la landing, buscador GET (`q`), filas «Descubre», «Nuevas» y por distrito; `distrito`, `ver=todas` o `ver=nuevas` y `pagina` muestran una cuadrícula paginada (24). Semilla del orden en la cookie `bf_network_seed` (la crea `proxy.ts`). | Público |
| `/panel/mis-visitas` y `/panel/perfil` | Visitas por barbería (solo agregados) y celular del perfil (etapa 13). Enlaces en el menú «Cuenta» del encabezado. | Autenticado |

Protección:

- `src/proxy.ts` redirige a `/login` si no hay sesión en `/panel/*` y `/aceptar-terminos`, y desde `/login` y `/registro` a `/panel` si ya hay sesión.
- Además, cada página y Server Action de `/panel/[orgId]` verifica en el servidor la sesión (`supabase.auth.getUser()` o `getClaims()`) y la membresía activa en ese `orgId`; si no la tiene, devuelve `notFound()`.
- El proxy no sustituye esta verificación ni RLS.

# Publicación y operación

> Versión 2: SQL, Auth y Vercel en `docs/v2-pasos-manuales.md`.

La etapa 8 prepara el código y el procedimiento. No crea proyectos externos,
no aplica migraciones remotas y no activa respaldos. Registrar la evidencia
operativa cuando el administrador complete cada paso.

## Entornos separados

| Entorno | Aplicación | Supabase | Datos |
| --- | --- | --- | --- |
| Desarrollo | `npm.cmd run dev`, local | Proyecto de desarrollo | Datos de prueba |
| Preview | Despliegue de pruebas de Vercel | Proyecto de desarrollo o pruebas | Datos de prueba |
| Producción | Dominio definitivo HTTPS | Proyecto separado de producción | Datos reales |

Vercel separa Development, Preview y Production y sus variables; configura cada
destino por separado. [Entornos de Vercel](https://vercel.com/docs/deployments/environments).

No copies datos reales a pruebas. `APP_ENV` y `VERCEL_ENV` deben coincidir;
Vercel tiene prioridad. `SUPABASE_PRODUCTION_PROJECT_REF` permite detectar
si desarrollo o Preview apuntan por error a producción. El código no puede
demostrar aislamiento si esa referencia no está declarada.

## Variables y despliegue

| Variable | Desarrollo | Preview | Producción |
| --- | --- | --- | --- |
| `APP_ENV` | `development` | `preview` | `production` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Dominio HTTPS de pruebas | Dominio HTTPS definitivo |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de desarrollo | URL de pruebas | URL de producción |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública de desarrollo | Clave pública de pruebas | Clave pública de producción |
| `SUPABASE_PRODUCTION_PROJECT_REF` | Referencia de producción | Referencia de producción | Referencia de producción |

Las claves públicas pueden ser publishable o anon heredada. Credenciales
administrativas y contraseñas de base de datos se usan fuera de la aplicación;
nunca van en `NEXT_PUBLIC_*`. No subir `.env.local` ni respaldos a Git.

1. Verifica localmente `npm.cmd run check`.
2. Ejecuta `supabase/verify-release.sql` en cada destino (incluye las funciones de reportes de la etapa 9): todas las filas deben
   mostrar `ready = true`. Aplica antes solo migraciones faltantes.
3. En Vercel, importa el repositorio, elige Next.js, Node 24 y la raíz del
   proyecto. Build: `npm run build`; instalación: `npm ci`.
4. Configura variables por entorno y vuelve a construir cuando cambien.
   `NEXT_PUBLIC_*` queda fijado en el bundle al compilar.
5. Para Production, build `npm run check:release && npm run build`: exige
   dominio HTTPS y referencia Supabase declarada. No sustituye comprobar el esquema.
6. En Supabase Auth configura Site URL y los destinos permitidos del entorno.
   Conserva el comportamiento de cuentas de `producto-y-reglas.md`.
7. Prueba Preview con dueño y trabajador y ensaya la restauración.
8. Publica producción después de registrar las verificaciones.

Landing y páginas públicas pueden indexarse en producción. Local y Preview
indican `noindex`; panel y autenticación siempre lo indican. `robots.txt`
no reemplaza la autorización.

## Respaldos

Definir responsable, ubicación cifrada externa y retención. Como punto de
partida: copia diaria y antes de cambiar el esquema, 7 copias diarias y 4
semanales. Ajustar frecuencia al volumen y pérdida de datos aceptable.
Guardar fecha, proyecto, versión y resultado.

Comprueba en el dashboard qué respaldos ofrece el plan. La copia de la base
de datos no contiene archivos de Storage: se conservan por separado.
[Respaldos de Supabase](https://supabase.com/docs/guides/platform/backups).

Para una exportación lógica, el administrador necesita Supabase CLI, Docker
y la cadena de conexión desde Connect (session pooler si la red lo necesita).
El procedimiento oficial exporta roles, esquema y datos; preservar además
historial de migraciones y políticas propias sobre `storage.objects`.
Consultar la guía completa para exclusiones y restauración según la versión.
[Backup y restauración con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

Copiar también **todos los objetos de `business-media`**, conservando rutas,
con inventario de tamaños y hashes. No basta con metadatos del bucket ni una
copia de Vercel. Verificar usuarios Auth y datos de la app: usuarios,
membresías y visitas están relacionados por claves foráneas.

## Ensayo de restauración y recuperación

1. Crear un destino aislado, sin apuntar la app real a él.
2. Restaurar según la guía oficial. No ejecutar instaladores sobre un dump
   que ya incluya esas tablas. Revisar las políticas propias de Storage.
3. Restaurar archivos con las mismas rutas y comprobar hashes.
4. Ejecutar `verify-release.sql`, comparar cantidades de registros e historial,
   y probar sesión, aislamiento, visitas, premios y fotos.
5. Registrar fecha, duración, copia y resultado. No considerar verificado
   un respaldo hasta que haya podido restaurarse.

Ante un fallo de versión, volver al despliegue anterior si su esquema sigue
siendo compatible. No borrar tablas para corregir un error visual. Ante pérdida
de datos, detener escrituras, preservar el estado afectado y probar primero la
restauración aislada. Estos pasos operativos no se ejecutan automáticamente.

## Evidencia pendiente antes de abrir al público

- [ ] Supabase de pruebas y producción separados; variables verificadas.
- [ ] Etapas 6 y 7 confirmadas; diagnóstico completo correcto en el destino.
- [ ] Recorrido autenticado de `README.md` probado en desarrollo.
- [ ] Registro/corrección/anulación simultáneos probados con conexiones reales.
- [ ] Copias de base de datos y Storage y restauración ensayada.
- [ ] Despliegue HTTPS, dominio, Auth y página pública verificados.

Estos puntos siguen pendientes de confirmación externa; las pruebas locales
no los marcan automáticamente como completados.

# Barbería Fiel

Aplicación para barberías en Perú: clientes, visitas, servicios, equipo,
premios configurables y página pública. Next.js 16, React 19, TypeScript,
Tailwind y Supabase. Las etapas 1–8 están implementadas localmente.
El despliegue y la validación autenticada remota siguen pendientes de confirmar.

Especificación: [CLAUDE.md](CLAUDE.md) y [docs/](docs/).
Esta versión no envía promociones ni recordatorios automáticos.

## Abrir la aplicación en Windows

Usa Node.js 22.18 o superior (verificado con Node 24).
En PowerShell, dentro de la carpeta del proyecto:

```powershell
npm.cmd ci
npm.cmd run dev
```

Abre [http://localhost:3000](http://localhost:3000). Mantén la terminal abierta;
`Ctrl+C` detiene el servidor. `npm.cmd` evita el bloqueo de `npm.ps1`.
Si los paquetes ya están instalados, basta con `npm.cmd run dev`.

## Configurar Supabase

1. Copia `.env.example` a `.env.local` y completa la URL y la clave publishable
   o anon del proyecto. Nunca uses secret ni service_role.
2. Reinicia Next.js después de cambiar variables.
3. `npm.cmd run check:config` valida la configuración sin imprimir claves.
4. `npm.cmd run check:supabase` comprueba Auth; no comprueba tablas ni permisos.

Los clientes SSR se crean por solicitud. El proxy renueva sesiones; cada
página y acción verifica además la sesión y membresía. RLS protege los datos.

## Instalar o verificar el esquema

Las migraciones no se aplican al iniciar la aplicación. La clave pública no
permite crear tablas. En el **SQL Editor del proyecto correcto**, aplica
únicamente las etapas que falten, completas y en orden:

| Etapa | Archivo para SQL Editor |
| --- | --- |
| 1: estructura | `supabase/setup-stage-1.sql` |
| 1: crear negocios | `supabase/setup-stage-1-business.sql` |
| 2: equipo | `supabase/setup-stage-2-team.sql` |
| 3: servicios | `supabase/setup-stage-3-services.sql` |
| 4: página pública | `supabase/setup-stage-4-public-page.sql` |
| 5: clientes | `supabase/setup-stage-5-customers.sql` |
| 6: fidelidad y visitas | `supabase/setup-stage-6-loyalty-visits.sql` |
| 7: corrección y anulación | `supabase/setup-stage-7-visit-corrections.sql` |
| 8: diagnóstico final, solo lectura | `supabase/verify-release.sql` |

`npm.cmd run prepare:supabase` regenera los instaladores desde las migraciones.
No repitas instalaciones ya aplicadas ni borres tablas para resolver un error.
Para diagnosticar la etapa 1 existe `supabase/verify-stage-1.sql`.
La etapa 8 no cambia el esquema ni requiere una migración nueva.

El diagnóstico final debe mostrar **17 tablas, 14 funciones, 2 índices y la
política de auditoría con `ready = true`**. No confirma datos ni flujos de usuario.
Todavía debe confirmarse la aplicación remota de las etapas 6 y 7.

La instalación manual no registra el historial de Supabase CLI. Antes de usar
`supabase db push`, verifica el esquema y registra solo versiones realmente
aplicadas con `supabase migration repair --status applied VERSION`.
Las versiones están en los nombres de `supabase/migrations/`. Los tipos
de Supabase están escritos a partir de esas migraciones; regenerarlos con
`supabase gen types typescript` cuando se disponga de CLI y acceso al proyecto.

## Verificaciones locales

```powershell
npm.cmd run check
```

Ejecuta lint, pruebas unitarias, pruebas PGlite y build (incluye tipos y
configuración). Por separado: `npm.cmd run lint`, `npx.cmd tsc --noEmit`,
`npm.cmd run test:unit`, `npm.cmd run test:db`, `npm.cmd run build`.
PGlite no verifica concurrencia de conexiones reales.

Para probar la compilación: `npm.cmd run build` y `npm.cmd run start`.
Esta modalidad no recarga cambios: usa `npm.cmd run dev` para desarrollar.

## Prueba del recorrido completo

En Supabase de **desarrollo**, con las migraciones aplicadas:

1. Crea cuenta y negocio; configura servicios y premio.
2. Publica la página con fotos, horario y contacto; comprueba el enlace sin sesión.
3. Agrega un trabajador con cuenta existente; entra con esa cuenta.
4. Registra un cliente con autorización y las visitas necesarias para ganar el premio.
5. Aplica el premio o déjalo pendiente y canjéalo en otra visita.
6. Desde la ficha, elige «Corregir o anular visita». Comprueba totales y puntos.
7. Como dueño, revisa «Auditoría». Como trabajador, confirma que no puedes abrirla.
8. Comprueba que un miembro desactivado y un usuario de otro negocio no accedan.

En esta v1, Supabase debe tener **Confirm email desactivado**, según la
especificación. La recuperación de contraseña tampoco está incluida.
Cambiar ese alcance requiere implementar los recorridos correspondientes.

## Publicación y respaldos

Consulta [docs/produccion.md](docs/produccion.md): separación de entornos,
variables de Vercel, respaldo de datos y archivos, restauración y publicación.
`npm.cmd run check:release` comprueba variables del entorno de producción;
no despliega, aplica SQL, configura backups ni certifica el recorrido remoto.

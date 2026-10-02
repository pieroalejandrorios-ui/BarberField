# Subir Barber Field a GitHub y desplegar en Vercel

## GitHub

El repositorio local ya está inicializado en la rama `main`. Todavía no tiene
commits ni un repositorio remoto configurado.

1. Crea un repositorio vacío en tu cuenta de GitHub. Puedes llamarlo
   `barber-field` y elegir visibilidad privada. No agregues README, licencia ni
   gitignore desde GitHub: el proyecto ya contiene sus archivos.
2. Abre PowerShell en la carpeta del proyecto:

```powershell
cd 'C:\Users\piero\Desktop\Proyecto(1)SAAS'
git add .
git diff --cached --name-only
```

En esa lista NO deben aparecer `.env.local`, otros archivos `.env` con valores,
`node_modules`, `.next`, `.vercel`, respaldos ni claves privadas. Sí debe aparecer
`.env.example`, que contiene nombres de variables y valores de ejemplo sin claves.

3. Guarda y sube el primer commit. Sustituye la URL por la que muestra tu
   repositorio de GitHub:

```powershell
git commit -m "Initial commit: Barber Field"
git remote add origin https://github.com/TU_USUARIO/barber-field.git
git push -u origin main
```

Si Git solicita iniciar sesión, completa el acceso de GitHub que abra tu equipo.
No pegues contraseñas ni tokens en estos comandos ni en el código.

Usa Git para subir el proyecto; no arrastres toda la carpeta al cargador web de
GitHub, porque ese flujo no aplica automáticamente las exclusiones de `.gitignore`.
No uses `git add -f` para incluir archivos excluidos.

La protección de `.gitignore` aplica a archivos que no están versionados. Si un
secreto ya fue publicado, quitarlo del último commit no lo elimina del historial:
hay que revocarlo y limpiar el historial siguiendo el procedimiento de GitHub.

## Vercel

1. En Vercel, crea un proyecto e importa el repositorio de GitHub. Concede a la
   integración acceso al repositorio que necesitas.
2. Configura Next.js, raíz del repositorio (`./`), Node.js **24.x**, instalación
   `npm ci`, compilación `npm run check:release && npm run build` y directorio de
   salida automático del framework.
3. Antes de compilar, configura estas variables en el entorno **Production**:

| Variable | Valor |
| --- | --- |
| `APP_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | URL HTTPS definitiva asignada al proyecto, sin rutas |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase elegido para producción |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publishable de ese proyecto |
| `SUPABASE_PRODUCTION_PROJECT_REF` | Identificador del proyecto Supabase, la parte anterior a `.supabase.co` |

Consulta la URL asignada en Vercel; no copies un dominio de ejemplo. Si tienes que
cambiarla después del primer intento, guarda las variables y vuelve a desplegar.
La validación del proyecto exige una URL pública HTTPS.

La compilación anterior es para Production. Para desplegar ramas de Preview,
usa `npm run build` como comando de compilación y configura sus propias variables
(`APP_ENV=preview`, URL HTTPS de pruebas y Supabase de pruebas). No copies
`APP_ENV=production` a todos los entornos. Consulta `produccion.md` para la separación
de datos y entornos.

Las variables se configuran en Vercel, no subiendo `.env.local` a GitHub.
Las variables `NEXT_PUBLIC_*` se incorporan al código del navegador durante la
compilación. La clave publishable está diseñada para uso público; las claves
secret/service_role y la contraseña de PostgreSQL no se usan en esta aplicación.

4. Verifica las migraciones del destino: ejecuta `supabase/verify-release.sql`
   en Supabase SQL Editor y confirma todas las filas `ready=true`. El despliegue
   de Vercel no ejecuta las migraciones SQL automáticamente. Aplica únicamente
   las etapas que falten, en orden, incluida la etapa 9 de reportes.
5. En Supabase Auth configura la Site URL y las Redirect URLs correspondientes
   al dominio de Vercel. Conserva los ajustes de autenticación del producto.
6. Despliega y prueba registro, login, equipo, servicios, clientes, visitas,
   premios, reportes como dueño y restricciones de acceso como trabajador.

Cuando cambies variables públicas, crea un nuevo despliegue para que se reconstruya
el código. `docs/produccion.md` contiene las comprobaciones de operación pendientes.

Fuentes: [Gitignore](https://git-scm.com/docs/gitignore),
[integración GitHub/Vercel](https://vercel.com/docs/git/vercel-for-github),
[variables de Vercel](https://vercel.com/docs/environment-variables) y
[Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

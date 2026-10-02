# Identidad visual

Nombre público: **Barber Field**. Eslogan: **Cada experiencia cuenta. Una razón más para volver**. Se conserva el monograma `bf.` y el icono existente. El nombre de cada negocio y sus imágenes siguen siendo los que configura su dueño.

La interfaz usa una única paleta clara: fondo marfil, verde oscuro para texto y acciones principales, verde hoja y lima como acentos. Las alertas conservan colores semánticos para errores, avisos y confirmaciones. No cambia según el tema del sistema.

## Fuentes compartidas

- `src/app/globals.css`: tokens `brand-*`, tipografía Geist, foco, superficies y barra fija con espacio para el área segura del dispositivo.
- `src/components/brand.tsx`: nombre y monograma.
- `src/components/ui.tsx`: botones principales/secundarios, campos etiquetados y mensajes de formulario.
- `src/components/fixed-cta.tsx`: barra de acceso rápido, a registro en el landing y a nueva visita dentro del negocio. Usa destinos existentes. Los contenedores reservan espacio inferior para no tapar contenido.
- Layouts de autenticación y panel: composición compartida; navegación del negocio con estado activo.

Clientes, equipo, servicios, premio, visitas, correcciones, auditoría y edición de la página pública usan esos colores y controles. La página pública de cada barbería mantiene sus datos, enlaces y fotografías, con la misma base visual.

Los cambios de diseño deben limitarse a presentación: no modificar consultas, acciones, validaciones, permisos, cálculos, destinos de enlaces ni funciones de Supabase. Mantener etiquetas, estados de envío, errores, foco y contraste.

# Supuestos pendientes de confirmar

Decisiones tomadas sin confirmación explícita del dueño del proyecto. Si alguna cambia, actualizar `docs/producto-y-reglas.md` y `docs/modelo-datos.md` antes de implementar la etapa afectada.

- Para agregar un trabajador, este debe tener cuenta primero (no hay invitaciones pendientes). Como no hay verificación de correo, cualquiera podría registrarse con un correo ajeno. Se recomienda activar la verificación antes de abrir la plataforma al público.
- Un trabajador activo no puede ser dueño de otro negocio al mismo tiempo.
- En la visita N el premio se aplica en esa misma visita. Si el cliente prefiere usarlo después, queda pendiente.
- La 5.ª visita (la del premio) cuenta para el ciclo que se cierra; el ciclo nuevo empieza en 0 con la siguiente visita.
- Corregir se permite en cualquier visita; anular, solo en la última de cada cliente, para no romper el conteo.
- Solo se aceptan DNI peruanos de 8 dígitos (sin carné de extranjería) en la v1.
- Un negocio tiene un solo local; para un segundo local se crea otro negocio.
- Los miembros no tienen nombre visible: el equipo y el selector «Atendido por» muestran el correo. Por eso un trabajador ve el correo de los demás miembros activos de su negocio.
- Volver a agregar por correo a un trabajador desactivado del mismo negocio lo reactiva (con las mismas validaciones), en lugar de dar error.
- La búsqueda de clientes no ignora tildes («Pérez» no se encuentra escribiendo «perez»). Se puede añadir `unaccent` más adelante si hace falta.
- Si al registrar un cliente su DNI ya existe archivado, la interfaz muestra ese cliente; solo el dueño puede restaurarlo.
- La promoción se guarda con una función (`save_loyalty_program`) y no con UPDATE directo, para validar la combinación de tipo y valor y dejar constancia en la auditoría.
- La visita en la que se canjea un premio pendiente también suma al ciclo actual (toda visita completada suma 1).
- En la visita N solo se ofrece el premio ganado (aplicado ahora o después); un premio pendiente anterior se aplica en otra visita, porque el máximo es un premio por visita.
- Si se archiva el servicio de un premio `free_service`, los premios pendientes de ese tipo no se pueden aplicar (el servicio ya no se puede registrar). La pantalla del premio avisa al dueño para que elija otro servicio para los ciclos nuevos.
- Un servicio aparece una sola vez por visita; para varias unidades se usa la cantidad.
- La vista previa del total en el registro de visita es solo informativa; el total oficial lo calcula la base de datos.

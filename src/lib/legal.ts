// Versiones vigentes de los textos legales. Deben coincidir con
// `private.terms_version()` y `private.owner_terms_version()` en la base de
// datos (lo comprueba `tests/db/accounts.test.mts`). Para publicar una versión
// nueva: cambiar aquí, crear una migración que reemplace esas funciones y
// actualizar `/terminos` o `/privacidad`.
export const TERMS_VERSION = "2026-10-01";
export const OWNER_TERMS_VERSION = "2026-10-01";

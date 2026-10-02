import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

// Traduce errores de Supabase a mensajes en español sin exponer SQL ni detalles
// internos. Los códigos propios (PT…) los definen las funciones RPC; ver
// `docs/modelo-datos.md`.

export type DbErrorKind =
  | "validation"
  | "permission"
  | "duplicate"
  | "not_found"
  | "conflict"
  | "connection"
  | "unknown";

const DB_ERROR_KINDS: Record<string, DbErrorKind> = {
  "22023": "validation",
  "22003": "validation",
  "22P02": "validation",
  "23502": "validation",
  "23514": "validation",
  "42501": "permission",
  "23505": "duplicate",
  "40001": "conflict",
  "40P01": "conflict",
  "55P03": "conflict",
  PT001: "conflict",
  PT002: "not_found",
  PT003: "validation",
  PT004: "conflict",
  PT005: "conflict",
  PT006: "duplicate",
  PT007: "not_found",
  PT008: "validation",
  PT009: "conflict",
  PT010: "conflict",
  PT011: "conflict",
  PT012: "conflict",
  PT013: "conflict",
  PT014: "conflict",
  PT015: "validation",
  PT016: "conflict",
  PT017: "conflict",
  PT018: "conflict",
  PT019: "conflict",
  PT020: "conflict",
};

const KIND_MESSAGES: Record<DbErrorKind, string> = {
  validation: "Revisa los datos ingresados.",
  permission: "No tienes permiso para hacer esto.",
  duplicate: "Ya existe un registro con esos datos.",
  not_found: "No se encontró lo que buscas. Recarga la página.",
  conflict: "Alguien hizo un cambio al mismo tiempo. Inténtalo de nuevo.",
  connection: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
  unknown: "Ocurrió un error inesperado. Inténtalo de nuevo.",
};

const CODE_MESSAGES: Record<string, string> = {
  PT001: "Eres trabajador activo de una barbería, así que no puedes crear una propia.",
  PT002: "No hay una cuenta con ese correo. Pide al trabajador que se registre primero.",
  PT003: "Ese es tu propio correo: ya eres el dueño.",
  PT004: "Esa persona es dueña de esta barbería.",
  PT005: "Esa persona ya trabaja en otra barbería.",
  PT006: "Esa persona ya es parte de tu equipo.",
  PT007: "Esa persona no es trabajador de esta barbería.",
  PT009: "Configura tu premio por fidelidad para empezar a registrar visitas.",
  PT010: "Este cliente está archivado y no puede recibir visitas nuevas.",
  PT011: "Uno de los servicios ya no está disponible. Recarga la página y elige otro.",
  PT012: "Esta visita ya se había registrado con otros datos. Revisa la ficha del cliente antes de volver a intentarlo.",
  PT013: "El progreso del cliente cambió y esta visita ya no completa el premio. Revisa el progreso y confirma de nuevo.",
  PT014: "Ese premio pendiente ya no está disponible. Recarga la página.",
  PT015: "Para aplicar el premio, la visita debe incluir el servicio gratis.",
  PT016: "La visita ya fue anulada y no se puede corregir.",
  PT017: "Solo puedes anular la última visita completada. Recarga el historial.",
  PT018: "No se puede anular: el premio o el ciclo tienen movimientos posteriores.",
  PT019: "Los términos se actualizaron. Recarga la página y vuelve a aceptarlos.",
  PT020: "Esa persona ya trabaja para 3 dueños distintos, el máximo permitido. Debe dejar uno antes.",
};

export function classifyDbError(error: { code?: string | null }): DbErrorKind {
  // supabase-js devuelve un código vacío cuando falla la red.
  if (!error.code) return "connection";
  return DB_ERROR_KINDS[error.code] ?? "unknown";
}

// `overrides` admite un código SQLSTATE o un tipo de error.
export function dbErrorMessage(
  error: { code?: string | null },
  overrides: Partial<Record<DbErrorKind, string>> & Record<string, string | undefined> = {},
): string {
  const kind = classifyDbError(error);
  const code = error.code ?? "";
  return overrides[code] ?? CODE_MESSAGES[code] ?? overrides[kind] ?? KIND_MESSAGES[kind];
}

export function authErrorMessage(error: AuthError): string {
  if (isAuthRetryableFetchError(error)) return KIND_MESSAGES.connection;

  switch (error.code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "user_already_exists":
    case "email_exists":
      return "Ya hay una cuenta con ese correo. Inicia sesión.";
    case "weak_password":
      return "La contraseña es muy débil. Usa una más larga o variada.";
    case "email_address_invalid":
      return "Escribe un correo válido.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    case "signup_disabled":
      return "El registro está desactivado por ahora.";
    case "email_not_confirmed":
      return "Tu correo aún no está confirmado.";
    default:
      return KIND_MESSAGES.unknown;
  }
}

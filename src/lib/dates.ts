const TIME_ZONE = "America/Lima";

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDate(value: string | Date): string {
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

// Inicio del día de hoy en Lima, como instante ISO. Perú no usa horario de
// verano: la medianoche local es siempre UTC-5.
export function startOfTodayInLima(now: Date = new Date()): string {
  return new Date(`${isoDateFormatter.format(now)}T00:00:00-05:00`).toISOString();
}

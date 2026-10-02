// Períodos de los reportes como fechas de calendario en America/Lima
// (YYYY-MM-DD, ambas incluidas). La base de datos convierte el rango a
// instantes y repite estas validaciones.

export const REPORT_PERIODS = ["hoy", "semana", "mes", "personalizado"] as const;
export type ReportPeriodKind = (typeof REPORT_PERIODS)[number];

// Igual que `get_business_report`: hasta 366 días incluidos.
export const MAX_REPORT_DAYS = 366;

export type ReportPeriod = { kind: ReportPeriodKind; from: string; to: string; label: string };
export type ReportPeriodResult = { ok: true; period: ReportPeriod } | { ok: false; kind: ReportPeriodKind; error: string };

const limaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Las fechas de calendario se manejan en UTC para no depender de la zona del servidor.
const plainDate = new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function todayInLima(now: Date = new Date()): string {
  return limaDate.format(now);
}

function toUtc(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return false;
  const date = toUtc(value);
  return Number.isFinite(date.getTime()) && toIso(date) === value;
}

export function formatPlainDate(value: string): string {
  return plainDate.format(toUtc(value));
}

export function isReportPeriodKind(value: unknown): value is ReportPeriodKind {
  return typeof value === "string" && (REPORT_PERIODS as readonly string[]).includes(value);
}

function rangeLabel(from: string, to: string): string {
  return from === to ? formatPlainDate(from) : `${formatPlainDate(from)} al ${formatPlainDate(to)}`;
}

export function resolveReportPeriod(
  input: { periodo?: string; desde?: string; hasta?: string },
  now: Date = new Date(),
): ReportPeriodResult {
  const kind = isReportPeriodKind(input.periodo) ? input.periodo : "hoy";
  const today = todayInLima(now);
  const todayDate = toUtc(today);

  if (kind === "hoy") {
    return { ok: true, period: { kind, from: today, to: today, label: `Hoy, ${formatPlainDate(today)}` } };
  }
  if (kind === "semana") {
    // Semana de lunes a domingo.
    const weekday = (todayDate.getUTCDay() + 6) % 7;
    const from = toIso(new Date(todayDate.getTime() - weekday * DAY_MS));
    const to = toIso(new Date(todayDate.getTime() + (6 - weekday) * DAY_MS));
    return { ok: true, period: { kind, from, to, label: `Semana actual: ${rangeLabel(from, to)}` } };
  }
  if (kind === "mes") {
    const year = todayDate.getUTCFullYear();
    const month = todayDate.getUTCMonth();
    const from = toIso(new Date(Date.UTC(year, month, 1)));
    const to = toIso(new Date(Date.UTC(year, month + 1, 0)));
    return { ok: true, period: { kind, from, to, label: `Mes actual: ${rangeLabel(from, to)}` } };
  }

  const from = input.desde ?? "";
  const to = input.hasta ?? "";
  if (!from || !to) return { ok: false, kind, error: "Elige la fecha de inicio y la de fin." };
  if (!isCalendarDate(from) || !isCalendarDate(to)) {
    return { ok: false, kind, error: "Escribe fechas válidas entre los años 2000 y 2100." };
  }
  if (from > to) return { ok: false, kind, error: "La fecha de inicio debe ser anterior o igual a la de fin." };
  if ((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS + 1 > MAX_REPORT_DAYS) {
    return { ok: false, kind, error: `El período puede tener como máximo ${MAX_REPORT_DAYS} días.` };
  }
  return { ok: true, period: { kind, from, to, label: `Del ${rangeLabel(from, to)}` } };
}

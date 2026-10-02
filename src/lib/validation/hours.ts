// Horario semanal: mismas reglas que `save_business_hours`.

export const WEEKDAYS = [
  { weekday: 1, label: "Lunes" },
  { weekday: 2, label: "Martes" },
  { weekday: 3, label: "Miércoles" },
  { weekday: 4, label: "Jueves" },
  { weekday: 5, label: "Viernes" },
  { weekday: 6, label: "Sábado" },
  { weekday: 7, label: "Domingo" },
] as const;

export const MAX_RANGES_PER_DAY = 2;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type TimeRange = { opensAt: string; closesAt: string };
export type DayHours = { weekday: number; isOpen: boolean; ranges: TimeRange[] };
export type HoursRow = { weekday: number; opens_at: string; closes_at: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Valida datos que vienen del navegador sin confiar en su forma.
export function parseHours(
  input: unknown,
): { ok: true; rows: HoursRow[] } | { ok: false; errors: Record<number, string> } {
  if (!Array.isArray(input)) return { ok: false, errors: { 0: "Horario inválido." } };

  const errors: Record<number, string> = {};
  const rows: HoursRow[] = [];

  for (const { weekday } of WEEKDAYS) {
    const day = input.find((item) => isRecord(item) && item.weekday === weekday);
    if (!isRecord(day) || day.isOpen !== true) continue;

    const ranges = Array.isArray(day.ranges) ? day.ranges : [];
    if (ranges.length === 0 || ranges.length > MAX_RANGES_PER_DAY) {
      errors[weekday] = `Indica uno o ${MAX_RANGES_PER_DAY} horarios, o marca el día como cerrado.`;
      continue;
    }

    const parsed: TimeRange[] = [];
    for (const range of ranges) {
      if (
        !isRecord(range) ||
        typeof range.opensAt !== "string" ||
        typeof range.closesAt !== "string" ||
        !TIME_PATTERN.test(range.opensAt) ||
        !TIME_PATTERN.test(range.closesAt)
      ) {
        errors[weekday] = "Completa la hora de apertura y de cierre.";
        break;
      }
      // Las horas «HH:MM» se comparan bien como texto.
      if (range.closesAt <= range.opensAt) {
        errors[weekday] = "La hora de cierre debe ser posterior a la de apertura.";
        break;
      }
      parsed.push({ opensAt: range.opensAt, closesAt: range.closesAt });
    }
    if (errors[weekday]) continue;

    parsed.sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    if (parsed.length === 2 && parsed[1].opensAt < parsed[0].closesAt) {
      errors[weekday] = "Los dos horarios del día no pueden cruzarse.";
      continue;
    }

    for (const range of parsed) rows.push({ weekday, opens_at: range.opensAt, closes_at: range.closesAt });
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, rows };
}

// Filas de la base de datos → estado del formulario (un día sin filas está cerrado).
export function rowsToDays(rows: HoursRow[]): DayHours[] {
  return WEEKDAYS.map(({ weekday }) => {
    const ranges = rows
      .filter((row) => row.weekday === weekday)
      .map((row) => ({ opensAt: row.opens_at.slice(0, 5), closesAt: row.closes_at.slice(0, 5) }));
    return { weekday, isOpen: ranges.length > 0, ranges };
  });
}

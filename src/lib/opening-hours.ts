// Horario de hoy en America/Lima para las tarjetas de la red. Puro (sin
// servidor) para poder probarlo.

export type HoursRange = { weekday: number; opensAt: string; closesAt: string };

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short" });
const WEEKDAY_NUMBERS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// 1 = lunes … 7 = domingo, como `business_hours.weekday`.
export function limaWeekday(now: Date = new Date()): number {
  return WEEKDAY_NUMBERS[weekdayFormatter.format(now)] ?? 1;
}

function formatTime(value: string): string {
  return value.replace(/^0(\d)/, "$1");
}

// «Hoy 9:00–13:00 y 15:00–21:00», «Hoy cerrado» o null si no publicó horario.
export function todayHoursLabel(hours: HoursRange[], now: Date = new Date()): string | null {
  if (hours.length === 0) return null;
  const today = limaWeekday(now);
  const ranges = hours.filter((h) => h.weekday === today);
  if (ranges.length === 0) return "Hoy cerrado";
  return `Hoy ${ranges.map((r) => `${formatTime(r.opensAt)}–${formatTime(r.closesAt)}`).join(" y ")}`;
}

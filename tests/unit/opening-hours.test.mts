import assert from "node:assert/strict";
import { test } from "node:test";
import { limaWeekday, todayHoursLabel } from "../../src/lib/opening-hours.ts";

// 1 oct 2026, 03:00 UTC = miércoles 30 sep, 22:00 en Lima.
const WEDNESDAY_NIGHT_LIMA = new Date("2026-10-01T03:00:00Z");
// 5 oct 2026, 04:59 UTC = domingo 4 oct, 23:59 en Lima.
const SUNDAY_LIMA = new Date("2026-10-05T04:59:00Z");

const HOURS = [
  { weekday: 3, opensAt: "09:00", closesAt: "13:00" },
  { weekday: 3, opensAt: "15:00", closesAt: "21:00" },
  { weekday: 6, opensAt: "10:00", closesAt: "18:00" },
];

test("el día de la semana se calcula en America/Lima", () => {
  assert.equal(limaWeekday(WEDNESDAY_NIGHT_LIMA), 3);
  assert.equal(limaWeekday(SUNDAY_LIMA), 7);
  assert.equal(limaWeekday(new Date("2026-10-05T05:00:00Z")), 1);
});

test("muestra los rangos de hoy, cerrado o nada si no hay horario", () => {
  assert.equal(todayHoursLabel(HOURS, WEDNESDAY_NIGHT_LIMA), "Hoy 9:00–13:00 y 15:00–21:00");
  assert.equal(todayHoursLabel(HOURS, SUNDAY_LIMA), "Hoy cerrado");
  assert.equal(todayHoursLabel([], SUNDAY_LIMA), null);
});

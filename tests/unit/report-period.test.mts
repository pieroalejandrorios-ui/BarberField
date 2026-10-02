import assert from "node:assert/strict";
import { test } from "node:test";
import { isCalendarDate, resolveReportPeriod, todayInLima } from "../../src/lib/report-period.ts";

// 1 oct 2026, 03:00 UTC = 30 sep 2026, 22:00 en Lima (miércoles).
const LATE_NIGHT_LIMA = new Date("2026-10-01T03:00:00Z");
// 1 oct 2026, 05:00 UTC = jueves 1 oct, 00:00 en Lima.
const MIDNIGHT_LIMA = new Date("2026-10-01T05:00:00Z");

test("hoy, semana y mes se calculan en America/Lima", () => {
  assert.equal(todayInLima(LATE_NIGHT_LIMA), "2026-09-30");
  assert.equal(todayInLima(MIDNIGHT_LIMA), "2026-10-01");

  const today = resolveReportPeriod({ periodo: "hoy" }, LATE_NIGHT_LIMA);
  assert.deepEqual(today.ok && [today.period.from, today.period.to], ["2026-09-30", "2026-09-30"]);

  const week = resolveReportPeriod({ periodo: "semana" }, MIDNIGHT_LIMA);
  assert.deepEqual(week.ok && [week.period.from, week.period.to], ["2026-09-28", "2026-10-04"]);
  const sunday = resolveReportPeriod({ periodo: "semana" }, new Date("2026-10-05T04:59:59Z"));
  assert.deepEqual(sunday.ok && [sunday.period.from, sunday.period.to], ["2026-09-28", "2026-10-04"]);

  const month = resolveReportPeriod({ periodo: "mes" }, LATE_NIGHT_LIMA);
  assert.deepEqual(month.ok && [month.period.from, month.period.to], ["2026-09-01", "2026-09-30"]);
  const february = resolveReportPeriod({ periodo: "mes" }, new Date("2028-02-10T12:00:00Z"));
  assert.deepEqual(february.ok && february.period.to, "2028-02-29");

  const fallback = resolveReportPeriod({ periodo: "otro" }, MIDNIGHT_LIMA);
  assert.equal(fallback.ok && fallback.period.kind, "hoy");
});

test("el período personalizado valida fechas, orden y tamaño", () => {
  const ok = resolveReportPeriod({ periodo: "personalizado", desde: "2026-09-01", hasta: "2026-09-15" });
  assert.deepEqual(ok.ok && [ok.period.from, ok.period.to], ["2026-09-01", "2026-09-15"]);
  assert(resolveReportPeriod({ periodo: "personalizado", desde: "2028-01-01", hasta: "2028-12-31" }).ok);

  for (const [desde, hasta] of [
    ["", "2026-09-15"], ["2026-09-16", "2026-09-15"], ["2026-02-30", "2026-03-01"],
    ["2026-9-1", "2026-09-15"], ["1999-12-31", "2000-01-01"], ["2025-01-01", "2026-01-02"],
    ["2026-13-01", "2026-12-31"], ["2026-00-01", "2026-12-31"],
    ["2026-01-00", "2026-12-31"], ["2026-01-32", "2026-12-31"],
  ]) {
    assert.equal(resolveReportPeriod({ periodo: "personalizado", desde, hasta }).ok, false, `${desde}..${hasta}`);
  }
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("2026-02-29"), false);
});

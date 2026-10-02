import assert from "node:assert/strict";
import { test } from "node:test";
import { centsToAmount, previewVisit, toCents } from "../../src/lib/visit-preview.ts";

const CUT = "11111111-1111-4111-8111-111111111111";
const BEARD = "22222222-2222-4222-8222-222222222222";
const lines = [
  { serviceId: CUT, price: "20.00", quantity: 1 },
  { serviceId: BEARD, price: "15.50", quantity: 1 },
];

test("convierte montos a céntimos y de vuelta", () => {
  assert.equal(toCents("25.5"), 2550);
  assert.equal(toCents("0.05"), 5);
  assert.equal(toCents("99999999.99"), 9999999999);
  assert.equal(centsToAmount(2550), "25.50");
  assert.equal(centsToAmount(5), "0.05");
});

test("coincide con el redondeo de register_visit", () => {
  // 15 % de 35.50 = 5.325 → 5.33 (mitad hacia arriba, como `round` en Postgres).
  const percent = previewVisit(lines, { type: "percent_discount", percent: "15.00" });
  assert.deepEqual([percent.subtotalCents, percent.discountCents, percent.totalCents], [3550, 533, 3017]);

  const fixed = previewVisit(lines, { type: "fixed_discount", amount: "50.00" });
  assert.deepEqual([fixed.discountCents, fixed.totalCents, fixed.lostCents], [3550, 0, 1450]);

  const free = previewVisit([{ ...lines[0], quantity: 2 }, lines[1]], { type: "free_service", serviceId: CUT });
  assert.deepEqual([free.discountCents, free.totalCents, free.missingRewardService], [2000, 3550, false]);

  const custom = previewVisit(lines, { type: "custom_benefit" });
  assert.equal(custom.discountCents, 0);
});

test("avisa si falta el servicio gratis e ignora cantidades en 0", () => {
  const preview = previewVisit([{ ...lines[0], quantity: 0 }, lines[1]], { type: "free_service", serviceId: CUT });
  assert.equal(preview.subtotalCents, 1550);
  assert.equal(preview.missingRewardService, true);
  assert.equal(preview.discountCents, 0);
});

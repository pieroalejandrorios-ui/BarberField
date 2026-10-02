import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMyVisits } from "../../src/lib/my-visits.ts";

test("valida el estado y los agregados de get_my_visits", () => {
  assert.equal(parseMyVisits(null), null);
  assert.equal(parseMyVisits({ status: "otro", items: [] }), null);
  assert.deepEqual(parseMyVisits({ status: "disabled", items: [] }), { status: "disabled", items: [] });

  const parsed = parseMyVisits({
    status: "ok",
    items: [
      {
        barbershop_name: "Norte",
        slug: "norte",
        district: "Miraflores",
        total_visits: 4,
        progress: 1,
        visits_required: 3,
        visits_remaining: 2,
        program_status: "paused",
        available_rewards: 1,
      },
      { barbershop_name: "Sur", slug: null, total_visits: 0, progress: null, visits_required: null, visits_remaining: null, program_status: null, available_rewards: 0 },
      { slug: "sin-nombre" },
      "basura",
    ],
  });
  assert.deepEqual(parsed, {
    status: "ok",
    items: [
      { barbershopName: "Norte", slug: "norte", district: "Miraflores", totalVisits: 4, progress: 1, visitsRequired: 3, visitsRemaining: 2, programPaused: true, availableRewards: 1 },
      { barbershopName: "Sur", slug: null, district: null, totalVisits: 0, progress: null, visitsRequired: null, visitsRemaining: null, programPaused: false, availableRewards: 0 },
    ],
  });
});

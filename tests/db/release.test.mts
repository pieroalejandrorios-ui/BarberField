import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTestDatabase } from "./test-database.mts";

test("el diagnóstico final valida las migraciones, RPC, permisos e índices de la aplicación", async () => {
  const db = await createTestDatabase();
  try {
    const sql = await readFile(new URL("../../supabase/verify-release.sql", import.meta.url), "utf8");
    const results = await db.exec(sql);
    assert.deepEqual(results.map(r => r.rows.length), [20, 23, 2, 1, 4]);
    for (const result of results) for (const row of result.rows) {
      assert(row !== null && typeof row === "object" && "ready" in row);
      assert.equal(row.ready, true, JSON.stringify(row));
    }
    await db.query("revoke execute on function public.correct_visit(uuid,jsonb,uuid,text) from authenticated");
    const changed = await db.exec(sql);
    const correction = changed[1].rows.find(r => r !== null && typeof r === "object" && "signature" in r && r.signature === "public.correct_visit(uuid,jsonb,uuid,text)");
    assert(correction !== null && typeof correction === "object" && "ready" in correction);
    assert.equal(correction.ready, false);
  } finally { await db.close(); }
});

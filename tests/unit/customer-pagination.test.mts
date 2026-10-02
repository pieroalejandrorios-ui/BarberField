import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePageNumber } from "../../src/lib/validation/pagination.ts";

test("la página de clientes admite páginas válidas y protege el integer de PostgreSQL", () => {
  assert.equal(parsePageNumber("2", 20), 2);
  assert.equal(parsePageNumber("107374183", 20), 107374183);
  for (const value of ["", "0", "-1", "2abc", "1.5", "Infinity", "107374184", "999999999999999999999999"]) {
    assert.equal(parsePageNumber(value, 20), 1, value);
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import { formatDate, formatDateTimeLocal, toIsoOrNull, toValidDate } from "../src/utils/formatters.js";

test("date formatters fall back safely for invalid dates", () => {
  assert.equal(toValidDate("not-a-date"), null);
  assert.equal(formatDate("not-a-date", "Sem data"), "Sem data");
  assert.equal(formatDateTimeLocal("not-a-date"), "");
  assert.equal(toIsoOrNull("not-a-date"), null);
});

test("date formatters keep valid dates usable", () => {
  assert.ok(toValidDate("2026-06-05T12:30:00.000Z") instanceof Date);
  assert.notEqual(formatDate("2026-06-05T12:30:00.000Z", "Sem data"), "Sem data");
  assert.match(formatDateTimeLocal("2026-06-05T12:30:00.000Z"), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(toIsoOrNull("2026-06-05T12:30:00.000Z"), "2026-06-05T12:30:00.000Z");
});

import assert from "node:assert/strict";
import test from "node:test";

import { consumeGoogleCalendarCallback } from "../src/utils/googleCalendarCallback.js";

test("OAuth completion reads the fragment and removes callback query parameters", () => {
  const result = consumeGoogleCalendarCallback(
    new URLSearchParams("tab=general&googleState=old&message=untrusted"),
    "#googleCalendar=authorize&googleCode=test-code&googleState=test-state"
  );
  assert.deepEqual(result.payload, { code: "test-code", state: "test-state" });
  assert.equal(result.cleanedParams.toString(), "tab=general");
  assert.doesNotMatch(result.message, /untrusted/);
});

test("legacy callbacks clean the URL but never trust arbitrary redirect messages", () => {
  const result = consumeGoogleCalendarCallback(new URLSearchParams("googleCalendar=connected&message=click+evil.example"));
  assert.equal(result.payload, null);
  assert.equal(result.cleanedParams.toString(), "");
  assert.equal(result.message, "Google Agenda conectado com sucesso.");
});

test("incomplete or oversized callbacks request a restart instead of waiting forever", () => {
  for (const params of ["googleCalendar=authorize", "googleCalendar=authorize&googleCode=code", `googleCalendar=authorize&googleCode=code&googleState=${"x".repeat(4097)}`]) {
    const result = consumeGoogleCalendarCallback(new URLSearchParams(params));
    assert.equal(result.payload, null);
    assert.match(result.message, /Inicie novamente/);
  }
});

test("denied, unknown and absent callbacks are safe", () => {
  assert.equal(consumeGoogleCalendarCallback(new URLSearchParams("tab=general")), null);
  assert.equal(consumeGoogleCalendarCallback(new URLSearchParams("googleCalendar=denied")).payload, null);
  assert.match(consumeGoogleCalendarCallback(new URLSearchParams("googleCalendar=unknown")).message, /Inicie novamente/);
});

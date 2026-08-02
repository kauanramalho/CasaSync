import assert from "node:assert/strict";
import test from "node:test";

import { createApiResponseError } from "../src/services/api.js";
import { isTwoFactorRequiredResponse } from "../src/utils/auth.js";

test("frontend enters 2FA only for the real backend challenge contract", () => {
  assert.equal(
    isTwoFactorRequiredResponse({
      requires_two_factor: true,
      pending_token: "pending-challenge-token",
      purpose: "login",
      delivery_mode: "development"
    }),
    true
  );
});

test("frontend does not enter 2FA for incomplete or ordinary auth responses", () => {
  assert.equal(isTwoFactorRequiredResponse({ requires_two_factor: true }), false);
  assert.equal(isTwoFactorRequiredResponse({ access_token: "access-token" }), false);
  assert.equal(isTwoFactorRequiredResponse(null), false);
});

test("frontend keeps 409 limited to a real conflict response", () => {
  const error = createApiResponseError(409, { detail: "E-mail ou username ja esta em uso." });
  assert.equal(error.status, 409);
  assert.equal(error.message, "E-mail ou username ja esta em uso.");
});

test("frontend renders validation details for 422 responses", () => {
  const error = createApiResponseError(422, {
    detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }]
  });
  assert.equal(error.status, 422);
  assert.match(error.message, /email/);
});

test("frontend never converts a 500 response into duplicate-user feedback", () => {
  const error = createApiResponseError(500, null);
  assert.equal(error.status, 500);
  assert.match(error.message, /Tente novamente em alguns minutos/);
  assert.doesNotMatch(error.message, /ja esta em uso/);
});

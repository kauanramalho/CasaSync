import assert from "node:assert/strict";
import test from "node:test";

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

import assert from "node:assert/strict";
import test from "node:test";

import handler, { authorized, validPayload } from "../api/internal/email-delivery.js";


function makeResponse() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

test("email relay accepts only the strict 2FA payload", () => {
  assert.equal(validPayload({
    recipient: "person@example.com",
    code: "654321",
    purpose: "signup",
    expires_minutes: 10,
  }), true);
  assert.equal(validPayload({
    recipient: "person@example.com",
    code: "654321\r\nBcc: attacker@example.com",
    purpose: "signup",
    expires_minutes: 10,
  }), false);
  assert.equal(validPayload({
    recipient: "person@example.com",
    code: "654321",
    purpose: "arbitrary",
    expires_minutes: 10,
  }), false);
});

test("email relay compares a strong bearer token", () => {
  const previousToken = process.env.EMAIL_DELIVERY_HTTP_TOKEN;
  process.env.EMAIL_DELIVERY_HTTP_TOKEN = "test-token-" + "x".repeat(40); // gitleaks:allow - synthetic test credential
  try {
    assert.equal(authorized({ headers: { authorization: `Bearer ${process.env.EMAIL_DELIVERY_HTTP_TOKEN}` } }), true);
    assert.equal(authorized({ headers: { authorization: "Bearer wrong" } }), false);
  } finally {
    if (previousToken === undefined) delete process.env.EMAIL_DELIVERY_HTTP_TOKEN;
    else process.env.EMAIL_DELIVERY_HTTP_TOKEN = previousToken;
  }
});

test("email relay rejects unauthorized requests before delivery", async () => {
  const response = makeResponse();
  await handler({ method: "POST", headers: {}, body: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { detail: "Unauthorized" });
});

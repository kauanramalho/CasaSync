import assert from "node:assert/strict";
import test from "node:test";
import { isNotificationVisible } from "../src/utils/notificationVisibility.js";

test("notification visibility always requires both account and active family", () => {
  const item = { user_id: "user-a", family_id: "family-a" };
  assert.equal(isNotificationVisible(item, "user-a", "family-a"), true);
  assert.equal(isNotificationVisible(item, "user-b", "family-a"), false);
  assert.equal(isNotificationVisible(item, "user-a", "family-b"), false);
  assert.equal(isNotificationVisible(item, null, "family-a"), false);
  assert.equal(isNotificationVisible(item, "user-a", null), false);
});

test("legacy notifications without ownership never leak into another session", () => {
  assert.equal(isNotificationVisible({ title: "Private legacy title" }, "user-a", "family-a"), false);
  assert.equal(isNotificationVisible({ user_id: "user-a" }, "user-a", "family-a"), false);
});

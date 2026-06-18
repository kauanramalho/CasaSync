import assert from "node:assert/strict";
import test from "node:test";

import { getNotificationPermissionLabel } from "../src/utils/pushNotifications.js";

test("notification permission labels are friendly for every browser state", () => {
  assert.equal(getNotificationPermissionLabel("granted"), "permitida");
  assert.equal(getNotificationPermissionLabel("denied"), "bloqueada");
  assert.equal(getNotificationPermissionLabel("default"), "ainda nao solicitada");
  assert.equal(getNotificationPermissionLabel("unsupported"), "nao suportada");
  assert.equal(getNotificationPermissionLabel("unexpected"), "indisponivel");
});

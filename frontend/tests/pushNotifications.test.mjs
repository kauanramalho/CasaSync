import assert from "node:assert/strict";
import test from "node:test";

import { getNotificationPermissionLabel, subscribeToBrowserPush } from "../src/utils/pushNotifications.js";

test("notification permission labels are friendly for every browser state", () => {
  assert.equal(getNotificationPermissionLabel("granted"), "permitida");
  assert.equal(getNotificationPermissionLabel("denied"), "bloqueada");
  assert.equal(getNotificationPermissionLabel("default"), "ainda nao solicitada");
  assert.equal(getNotificationPermissionLabel("unsupported"), "nao suportada");
  assert.equal(getNotificationPermissionLabel("unexpected"), "indisponivel");
});

test("first subscription waits for an active service worker", async () => {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldNotification = Object.getOwnPropertyDescriptor(globalThis, "Notification");
  let subscribed = false;
  const active = { pushManager: { getSubscription: async () => null, subscribe: async () => { subscribed = true; return { toJSON: () => ({ endpoint: "qa-endpoint" }) }; } } };
  const notification = { permission: "granted", requestPermission: async () => "granted" };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: { register: async () => ({ active: null }), ready: Promise.resolve(active) } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { PushManager: {}, Notification: notification, atob: (value) => Buffer.from(value, "base64").toString("binary") } });
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: notification });
  try {
    assert.deepEqual(await subscribeToBrowserPush("AQID"), { endpoint: "qa-endpoint" });
    assert.equal(subscribed, true);
  } finally {
    for (const [name, descriptor] of [["navigator", oldNavigator], ["window", oldWindow], ["Notification", oldNotification]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
});

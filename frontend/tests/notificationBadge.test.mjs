import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import sharp from "sharp";
import { notificationBadgeArtwork } from "../tools/iconArtwork.mjs";

const badgePath = "/icons/notification-badge-96.png?v=20261009";
const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function workerHarness() {
  const listeners = new Map();
  const notifications = [];
  const removed = [];
  const installed = [];
  const self = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    registration: { showNotification: async (title, options) => notifications.push({ title, options }) },
    clients: { claim: async () => {} }
  };
  const caches = {
    open: async (name) => ({ addAll: async (paths) => installed.push({ name, paths }) }),
    keys: async () => ["casasync-static-v2", "casasync-static-v3", "other-app-cache"],
    delete: async (name) => removed.push(name)
  };
  vm.runInNewContext(source, { self, caches, URL });
  const dispatch = async (type, data = {}) => {
    let pending;
    listeners.get(type)({ ...data, waitUntil: (promise) => { pending = promise; } });
    await pending;
  };
  return { dispatch, notifications, removed, installed };
}

test("Android badge is a reproducible 96px white mark on transparent padding, never a square tile", async () => {
  const png = await readFile(new URL("../public/icons/notification-badge-96.png", import.meta.url));
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 96);
  assert.equal(metadata.height, 96);
  assert.equal(metadata.hasAlpha, true);
  assert.deepEqual(png, await sharp(Buffer.from(notificationBadgeArtwork())).png().toBuffer());
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let painted = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * info.channels;
    const alpha = data[offset + 3];
    if (x < 8 || y < 8 || x >= 88 || y >= 88) assert.equal(alpha, 0, "keep transparent safety padding");
    if (alpha > 0) {
      painted++;
      assert.equal(data[offset], 255); assert.equal(data[offset + 1], 255); assert.equal(data[offset + 2], 255);
    }
  }
  assert.ok(painted > 96 * 96 * 0.15 && painted < 96 * 96 * 0.55, "recognizable mark, not opaque square");
});

test("push keeps the large app icon and duplicate tag while using the transparent small badge", async () => {
  const worker = workerHarness();
  await worker.dispatch("push", { data: { json: () => ({ title: "Synthetic test", body: "Synthetic body", tag: "stable-dedupe-key", timestamp: 123 }) } });
  assert.equal(worker.notifications.length, 1);
  const { title, options } = worker.notifications[0];
  assert.equal(title, "Synthetic test");
  assert.equal(options.icon, "/icons/icon-192.png?v=20261008");
  assert.equal(options.badge, badgePath);
  assert.equal(options.tag, "stable-dedupe-key");
  assert.equal(options.renotify, false);
  assert.equal(options.timestamp, 123);
});

test("missing or malformed push data still shows a safe notification with the new badge", async () => {
  const worker = workerHarness();
  await worker.dispatch("push");
  await worker.dispatch("push", { data: { json: () => { throw new Error("malformed"); } } });
  for (const { title, options } of worker.notifications) {
    assert.equal(title, "CasaSync");
    assert.equal(options.badge, badgePath);
    assert.equal(options.data.url, "/");
  }
});

test("worker install precaches the exact versioned badge URL", async () => {
  const worker = workerHarness();
  await worker.dispatch("install");
  assert.equal(worker.installed[0].name, "casasync-static-v3");
  assert.ok(worker.installed[0].paths.includes(badgePath));
});

test("worker upgrade cleans only old CasaSync cache without touching other apps", async () => {
  const worker = workerHarness();
  await worker.dispatch("activate");
  assert.deepEqual(worker.removed, ["casasync-static-v2"]);
});

test("creator photo is optional while the app icon and Android badge stay intact", async () => {
  const worker = workerHarness();
  const avatar = "https://casasync-api.onrender.com/api/uploads/images/a1234567-1234-1234-1234-123456789abc";
  await worker.dispatch("push", { data: { json: () => ({ title: "Synthetic creator", avatarUrl: avatar }) } });
  assert.equal(worker.notifications[0].options.image, avatar);
  assert.equal(worker.notifications[0].options.icon, "/icons/icon-192.png?v=20261008");
  assert.equal(worker.notifications[0].options.badge, badgePath);
});

test("untrusted avatar URLs cannot make the worker fetch arbitrary images or credentials", async () => {
  const worker = workerHarness();
  const base = "https://casasync-api.onrender.com/api/uploads/images/a1234567-1234-1234-1234-123456789abc";
  for (const avatarUrl of ["https://tracker.example/image.png", "data:image/svg+xml,evil", "javascript:evil", base + "?token=no",
    base + "#token", base.replace("https://", "http://"), base.replace("casasync-api", "user:password@casasync-api"), base.replace("/images/", "/private/"), 42]) {
    await worker.dispatch("push", { data: { json: () => ({ avatarUrl }) } });
  }
  for (const { options } of worker.notifications) {
    assert.equal(options.image, undefined);
    assert.equal(options.icon, "/icons/icon-192.png?v=20261008");
  }
});

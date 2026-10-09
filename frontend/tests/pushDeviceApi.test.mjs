import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Node has no Vite import.meta.env: inject a synthetic build environment and
// preserve real imports to exercise the production request helper, without I/O.
const apiFile = new URL("../src/services/api.js", import.meta.url);
const source = (await readFile(apiFile, "utf8"))
  .replaceAll('"./apiConfig.js"', JSON.stringify(new URL("./apiConfig.js", apiFile).href))
  .replaceAll('"../utils/auth.js"', JSON.stringify(new URL("../utils/auth.js", apiFile).href))
  .replaceAll("import.meta.env", '({ PROD: true, VITE_API_URL: "https://api.example.test/api" })');
const { notificationsApi } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

async function withSyntheticBrowser(run) {
  const originals = new Map(["localStorage", "sessionStorage", "fetch"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const stored = new Map([["casasync_token", "synthetic-session"], ["casasync_active_family_id", "synthetic-family"]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key) => stored.get(key) || null } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => null } });
  try { await run(); } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", keys: { p256dh: "p".repeat(24), auth: "a".repeat(16) } };

test("device test uses authenticated active-family POST and reports acceptance only", async () => {
  await withSyntheticBrowser(async () => {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls += 1;
      assert.equal(url, "https://api.example.test/api/notifications/push-subscriptions/test");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer synthetic-session");
      assert.equal(options.headers["X-CasaSync-Family-Id"], "synthetic-family");
      assert.equal(options.credentials, "omit");
      assert.deepEqual(JSON.parse(options.body), subscription);
      return { ok: true, status: 200, json: async () => ({ accepted: true, message: "Provider accepted; display not verified" }) };
    };
    const result = await notificationsApi.testPushSubscription(subscription);
    assert.equal(result.accepted, true);
    assert.equal(result.delivered, undefined);
    assert.equal(calls, 1);
  });
});

test("device test preserves activation and cooldown errors without automatic resend", async () => {
  await withSyntheticBrowser(async () => {
    for (const status of [409, 429, 502]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return { ok: false, status, json: async () => ({ detail: "synthetic safe message" }) };
      };
      await assert.rejects(notificationsApi.testPushSubscription(subscription), (error) => {
        assert.equal(error.status, status);
        assert.equal(error.message, "synthetic safe message");
        return true;
      });
      assert.equal(calls, 1);
    }
  });
});

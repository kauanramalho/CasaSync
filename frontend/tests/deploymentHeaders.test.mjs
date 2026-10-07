import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

test("frontend deployment denies framing and suppresses credential referrers", () => {
  const headers = Object.fromEntries(config.headers.find((entry) => entry.source === "/(.*)").headers.map(({ key, value }) => [key, value]));
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
});

test("service worker is revalidated without removing SPA navigation", () => {
  assert.deepEqual(config.headers.find((entry) => entry.source === "/sw.js").headers, [{ key: "Cache-Control", value: "no-cache" }]);
  assert.ok(config.rewrites.some((entry) => entry.source === "/(.*)" && entry.destination === "/index.html"));
});

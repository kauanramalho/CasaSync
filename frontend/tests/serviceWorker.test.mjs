import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

function fixture() {
  const listeners = {};
  const shown = [];
  const opened = [];
  const self = { location: { origin: "https://example.com" }, addEventListener: (name, handler) => { listeners[name] = handler; }, registration: { showNotification: async (...args) => shown.push(args) }, clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) } };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, URL, Date });
  return { listeners, shown, opened };
}
test("background push displays balloon with icon and deterministic tag", async () => {
  const { listeners, shown } = fixture();
  let completion;
  listeners.push({ data: { json: () => ({ title: "Lembrete", body: "QA", tag: "reminder-1" }) }, waitUntil: (promise) => { completion = promise; } });
  await completion;
  assert.equal(shown[0][0], "Lembrete");
  assert.equal(shown[0][1].tag, "reminder-1");
  assert.equal(shown[0][1].renotify, false);
  assert.match(shown[0][1].icon, /icon-192/);
});
test("notification clicks stay inside application origin", async () => {
  const { listeners, opened } = fixture();
  let completion;
  listeners.notificationclick({ notification: { close() {}, data: { url: "https://external.example/task" } }, waitUntil: (promise) => { completion = promise; } });
  await completion;
  assert.equal(opened[0], "https://example.com");
});
test("malformed push safely shows generic notification", async () => {
  const { listeners, shown } = fixture();
  let completion;
  listeners.push({ data: { json() { throw new Error(); } }, waitUntil: (promise) => { completion = promise; } });
  await completion;
  assert.equal(shown[0][0], "CasaSync");
});

import assert from "node:assert/strict";
import test from "node:test";

import { API_REQUEST_TIMEOUT_MS, fetchWithTimeout } from "../src/services/api.js";

test("o prazo do cliente comporta a inicializacao observada de 43 segundos", () => {
  assert.ok(API_REQUEST_TIMEOUT_MS > 43000);
  assert.ok(API_REQUEST_TIMEOUT_MS <= 90000);
});

test("timeout interrompe a requisicao e permite retry manual sem reenviar POST", async () => {
  let calls = 0;
  const fetchImpl = (_url, { signal }) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  };
  await assert.rejects(fetchWithTimeout("https://api.example.test/api/families", { method: "POST" }, { timeoutMs: 5, fetchImpl }), (error) => {
    assert.equal(error.isTimeoutError, true);
    assert.match(error.message, /iniciando/);
    return true;
  });
  assert.equal(calls, 1);
});

test("failed fetch nao e convertido em timeout nem repetido automaticamente", async () => {
  let calls = 0;
  const failure = new TypeError("Failed to fetch");
  await assert.rejects(fetchWithTimeout("https://api.example.test/api/families", {}, {
    timeoutMs: 100,
    fetchImpl: async () => { calls += 1; throw failure; }
  }), (error) => error === failure);
  assert.equal(calls, 1);
});

test("servidor que responde antes do prazo conserva a resposta original", async () => {
  const response = { ok: true, status: 200 };
  assert.equal(await fetchWithTimeout("https://api.example.test/api/families", {}, { fetchImpl: async () => response }), response);
});

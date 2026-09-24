import assert from "node:assert/strict";
import test from "node:test";

import { createApiResponseError, normalizeApiUrl } from "../src/services/api.js";
import { resolveApiUrl } from "../src/services/apiConfig.js";

test("normaliza a URL publica do backend sem duplicar /api", () => {
  assert.equal(normalizeApiUrl("https://casasync-api.onrender.com", { isProduction: true }), "https://casasync-api.onrender.com/api");
  assert.equal(normalizeApiUrl("https://casasync-api.onrender.com/api/", { isProduction: true }), "https://casasync-api.onrender.com/api");
});

test("recusa localhost e HTTP no build de producao", () => {
  assert.throws(() => normalizeApiUrl("http://localhost:8000/api", { isProduction: true }), /HTTPS/);
  assert.throws(() => normalizeApiUrl("https://127.0.0.1:8000/api", { isProduction: true }), /maquina local/);
});

test("mantem falhas de backend distintas de conflito de cadastro", () => {
  assert.equal(createApiResponseError(401, null).message, "Sua sessao expirou. Entre novamente para continuar.");
  assert.match(createApiResponseError(503, null).message, /servidor CasaSync/);
  assert.equal(createApiResponseError(409, null).message, "E-mail ou username ja esta em uso.");
});

test("producao exige API configurada e desenvolvimento permite fallback local", () => {
  assert.throws(() => resolveApiUrl({ PROD: true, DEV: false }), /API nao configurada/);
  assert.throws(() => resolveApiUrl({ PROD: true, DEV: true }), /API nao configurada/);
  const developmentFallback = { developmentFallbackUrl: "http://localhost:8000/api" };
  assert.equal(resolveApiUrl({ DEV: true }, developmentFallback), "http://localhost:8000/api");
  assert.throws(() => resolveApiUrl({ PROD: true }, developmentFallback), /API nao configurada/);
  assert.equal(resolveApiUrl({ PROD: true, NEXT_PUBLIC_API_URL: "https://casasync-api.onrender.com" }), "https://casasync-api.onrender.com/api");
});

test("URL da API elimina barras duplicadas e nunca aceita credenciais", () => {
  assert.equal(resolveApiUrl({ PROD: true, VITE_API_URL: "  https://casasync-api.onrender.com//api/  " }), "https://casasync-api.onrender.com/api");
  assert.throws(() => resolveApiUrl({ PROD: true, VITE_API_URL: "https://user:password@example.test/api" }), /credenciais/);
});

test("status HTTP nao sao confundidos com CORS ou falta de familia", () => {
  for (const [status, message] of [[401, /sessao expirou/], [403, /permissao/], [404, /nao foi encontrado/], [429, /Muitas tentativas/], [500, /servidor CasaSync/], [503, /servidor CasaSync/]]) {
    const error = createApiResponseError(status, null);
    assert.equal(error.status, status);
    assert.match(error.message, message);
    assert.equal(error.isNetworkError, undefined);
  }
});

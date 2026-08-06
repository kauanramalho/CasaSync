import assert from "node:assert/strict";
import test from "node:test";

import { createApiResponseError, normalizeApiUrl } from "../src/services/api.js";

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

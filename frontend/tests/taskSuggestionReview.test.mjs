import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewItem, buildTaskImportPayload, resolveSuggestionAssigneesFromMembers } from "../src/utils/taskSuggestionReview.js";

const members = [
  {
    id: "membership-kauan",
    user_id: "user-kauan",
    role: "owner",
    user: { id: "user-kauan", name: "Kauan Ramalho", username: "kauan", email: "kauan@example.com" }
  },
  {
    id: "membership-bia",
    user_id: "user-bia",
    role: "member",
    user: { id: "user-bia", name: "Bia", username: "bia", email: "bia@example.com" }
  }
];

test("buildReviewItem preserves API assigneeIds and marks Kauan", () => {
  const item = buildReviewItem({ title: "Academia", confidence: 0.9, assigneeIds: ["user-kauan"] }, 0, [], members);
  assert.deepEqual(item.assigneeIds, ["user-kauan"]);
  assert.equal(item.assigneeResolutionStatus, "resolved");
});

test("buildReviewItem resolves originalAssigneeText Bia with no backend ids", () => {
  const item = buildReviewItem({ title: "Consulta", confidence: 0.9, originalAssigneeText: "Bia", assigneeIds: [] }, 0, [], members);
  assert.deepEqual(item.assigneeIds, ["user-bia"]);
  assert.equal(item.assigneeResolutionStatus, "resolved");
});

test("buildReviewItem resolves UI text Sugestao original Bia with no backend ids", () => {
  const item = buildReviewItem({ title: "Consulta", confidence: 0.9, responsible: "Sugestao original: Bia", assigneeIds: [] }, 0, [], members);
  assert.deepEqual(item.assigneeIds, ["user-bia"]);
  assert.equal(item.assigneeResolutionStatus, "resolved");
});

test("buildReviewItem resolves detected text with Responsavel Kauan", () => {
  const item = buildReviewItem(
    {
      title: "Academia",
      confidence: 0.9,
      originalText: "Academia Data: 05/06/2026 Hora: 07:00 Local: Smart Fit Centro Responsavel: Kauan",
      assigneeIds: []
    },
    0,
    [],
    members
  );
  assert.deepEqual(item.assigneeIds, ["user-kauan"]);
  assert.equal(item.assigneeResolutionStatus, "resolved");
});

test("buildReviewItem resolves natural language tarefa da Bia", () => {
  const item = buildReviewItem({ title: "Consulta", confidence: 0.9, originalText: "Essa tarefa e da Bia", assigneeIds: [] }, 0, [], members);
  assert.deepEqual(item.assigneeIds, ["user-bia"]);
  assert.equal(item.assigneeResolutionStatus, "resolved");
});

test("buildReviewItem resolves Kauan e Bia from original text", () => {
  const item = buildReviewItem({ title: "Plano", confidence: 0.9, originalAssigneeText: "Kauan e Bia", assigneeIds: [] }, 0, [], members);
  assert.deepEqual(item.assigneeIds, ["user-kauan", "user-bia"]);
  assert.equal(item.assigneeResolutionStatus, "resolved");
});

test("frontend fallback resolves OCR Kuan to Kauan when it is clear", () => {
  const item = buildReviewItem({ title: "Academia", confidence: 0.9, responsible: "Kuan", assigneeIds: [] }, 0, [], members);
  assert.deepEqual(item.assigneeIds, ["user-kauan"]);
  assert.equal(item.assigneeResolutionStatus, "resolved");
});

test("resolver can run after suggestions arrive before members", () => {
  const itemWithoutMembers = buildReviewItem({ title: "Consulta", confidence: 0.9, originalAssigneeText: "Bia", assigneeIds: [] }, 0, [], []);
  assert.deepEqual(itemWithoutMembers.assigneeIds, []);

  const resolved = resolveSuggestionAssigneesFromMembers(itemWithoutMembers, members);
  assert.deepEqual(resolved.assigneeIds, ["user-bia"]);
  assert.equal(resolved.assigneeResolutionStatus, "resolved");
});

test("ambiguous first name is not auto-selected", () => {
  const ambiguousMembers = [
    { id: "m1", user_id: "user-joao-silva", user: { id: "user-joao-silva", name: "Joao Silva" } },
    { id: "m2", user_id: "user-joao-pereira", user: { id: "user-joao-pereira", name: "Joao Pereira" } }
  ];
  const item = buildReviewItem({ title: "Reuniao", confidence: 0.9, originalAssigneeText: "Responsavel: Joao", assigneeIds: [] }, 0, [], ambiguousMembers);
  assert.deepEqual(item.assigneeIds, []);
  assert.equal(item.assigneeResolutionStatus, "ambiguous");
  assert.ok(item.assigneeResolutionWarnings.length > 0);
});

test("natural language assignee matrix resolves only clear family members", () => {
  const cases = [
    ["Bia lavar a louca hoje", ["user-bia"], "resolved"],
    ["Kauan pagar a internet sexta", ["user-kauan"], "resolved"],
    ["Coloca para a Bia comprar leite amanha as 8", ["user-bia"], "resolved"],
    ["Criar tarefa para Kauan limpar a cozinha", ["user-kauan"], "resolved"],
    ["Me lembra de estudar magnetismo hoje a noite", ["user-kauan"], "resolved"],
    ["Eu preciso tirar o lixo as 20h", ["user-kauan"], "resolved"],
    ["A Bia precisa levar o remedio amanha cedo", ["user-bia"], "resolved"],
    ["Fulano fazer mercado amanha", [], "not_found"],
    ["Ela precisa comprar pao", [], "ambiguous"],
    ["Comprar leite amanha", [], "unresolved"]
  ];

  cases.forEach(([text, expectedIds, expectedStatus]) => {
    const result = resolveSuggestionAssigneesFromMembers(
      { title: text, originalText: text },
      members,
      "user-kauan"
    );
    assert.deepEqual(result.assigneeIds, expectedIds, text);
    assert.equal(result.assigneeResolutionStatus, expectedStatus, text);
  });
});

test("Bia alias resolves Ana Beatriz only when unique", () => {
  const uniqueMembers = [{ id: "m-bia", user_id: "user-beatriz", user: { id: "user-beatriz", name: "Ana Beatriz" } }];
  const resolved = resolveSuggestionAssigneesFromMembers(
    { originalText: "Bia lavar a louca" },
    uniqueMembers,
    "user-beatriz"
  );
  assert.deepEqual(resolved.assigneeIds, ["user-beatriz"]);

  const ambiguousMembers = [
    { id: "m1", user_id: "user-ana-beatriz", user: { id: "user-ana-beatriz", name: "Ana Beatriz" } },
    { id: "m2", user_id: "user-maria-beatriz", user: { id: "user-maria-beatriz", name: "Maria Beatriz" } }
  ];
  const ambiguous = resolveSuggestionAssigneesFromMembers({ originalText: "Bia lavar a louca" }, ambiguousMembers);
  assert.deepEqual(ambiguous.assigneeIds, []);
  assert.equal(ambiguous.assigneeResolutionStatus, "ambiguous");

  const collisionMembers = [
    { id: "m-bia", user_id: "user-bia", user: { id: "user-bia", name: "Bia Souza" } },
    { id: "m-beatriz", user_id: "user-ana-beatriz", user: { id: "user-ana-beatriz", name: "Ana Beatriz" } }
  ];
  const collision = resolveSuggestionAssigneesFromMembers({ originalText: "Bia lavar a louca" }, collisionMembers);
  assert.deepEqual(collision.assigneeIds, []);
  assert.equal(collision.assigneeResolutionStatus, "ambiguous");
});

test("reviewed assignee ids are preserved in final import payload", () => {
  const item = buildReviewItem(
    { suggestionId: "suggestion-bia", title: "Lavar a louca", originalText: "Bia lavar a louca", confidence: 0.95 },
    0,
    [],
    members,
    "user-kauan"
  );
  const payload = buildTaskImportPayload([item]);
  assert.deepEqual(payload.items[0].assigneeIds, ["user-bia"]);
});

test("explicit family member wins over self reference", () => {
  const result = resolveSuggestionAssigneesFromMembers(
    { originalText: "Pedir para Bia me lembrar da conta" },
    members,
    "user-kauan"
  );
  assert.deepEqual(result.assigneeIds, ["user-bia"]);
});

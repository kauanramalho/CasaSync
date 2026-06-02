import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewItem, resolveSuggestionAssigneesFromMembers } from "../src/utils/taskSuggestionReview.js";

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

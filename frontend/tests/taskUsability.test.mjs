import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { aiImportPreferenceKey, readAIQuickReview, saveAIQuickReview } from "../src/utils/aiImportPreferences.js";

const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("AI quick-review preference is opt-in and isolated per account", () => {
  const target = storage();
  assert.equal(aiImportPreferenceKey(null), null);
  assert.equal(readAIQuickReview("first", target), false);
  assert.equal(saveAIQuickReview("first", true, target), true);
  assert.equal(readAIQuickReview("first", target), true);
  assert.equal(readAIQuickReview("second", target), false);
  assert.equal(saveAIQuickReview("first", false, target), true);
  assert.equal(readAIQuickReview("first", target), false);
  assert.equal(saveAIQuickReview(null, true, target), false);
  assert.equal(saveAIQuickReview("first", "true", target), false);
});

test("corrupt, blocked or silently refused storage fails closed", () => {
  for (const value of ["bad-json", "1", '"true"', "null", "{}", "[]"]) {
    assert.equal(readAIQuickReview("first", { getItem: () => value }), false);
  }
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readAIQuickReview("first", blocked), false);
  assert.equal(saveAIQuickReview("first", true, blocked), false);
  assert.equal(saveAIQuickReview("first", true, { getItem: () => null, setItem() {} }), false);
  assert.equal(readAIQuickReview("first"), false); // SSR
  assert.equal(saveAIQuickReview("first", true), false);
});

test("manual task form precedes collapsed AI and advanced sections", () => {
  const text = source("pages/NewTask.jsx");
  assert.ok(text.indexOf('<form onSubmit={handleSubmit}') < text.indexOf("<ImageTaskImportPanel"));
  assert.equal((text.match(/<details\b/g) || []).length, 3);
  assert.doesNotMatch(text, /<details\b[^>]*\bopen(?:=|[ >])/);
  assert.match(text, /navigate\("\/"\)/);
  assert.match(text, /if \(savingRef.current\) return/);
});

test("analysis never imports tasks; explicit reviewed import retains safe fallback and duplicate guard", () => {
  const text = source("components/ImageTaskImportPanel.jsx");
  const analyze = text.slice(text.indexOf("async function handleAnalyze()"), text.indexOf("async function handleImportSuggestions"));
  assert.doesNotMatch(analyze, /tasksApi\.|importSuggestions|handleImportSuggestions\(/);
  assert.match(text, /onClick={handleImportSuggestions}/);
  assert.match(text, /safeOnly: false/);
  assert.match(text, /autoCreate: safeOnly/);
  assert.match(text, /const validationErrors = safeOnly \? {} : validateReviewItemsBeforeImport\(selectedItems\)/);
  assert.match(text, /if \(operationRef.current \|\| analyzing \|\| importing\) return/);
  assert.doesNotMatch(text, /Confiar na IA e criar automaticamente/);
});

test("details delete is wired in Dashboard, Tasks and Calendar while only Tasks edits", () => {
  assert.match(source("components/TaskDetailsModal.jsx"), /onClick={\(\) => onDelete\(currentTask\)}/);
  for (const page of ["Dashboard", "Calendar", "Tasks"]) {
    const text = source(`pages/${page}.jsx`);
    assert.match(text, /onDelete={requestTaskDelete}/);
    assert.match(text, /<TaskDeleteConfirmModal/);
  }
  for (const page of ["Dashboard", "Calendar"]) {
    assert.doesNotMatch(source(`pages/${page}.jsx`), /TaskEditorModal|onEdit=|Editar tarefa/);
  }
  assert.match(source("pages/Tasks.jsx"), /<TaskEditorModal/);
});

test("categories open their focused dialog only on demand and preserve the server contract", () => {
  const text = source("pages/Categories.jsx");
  assert.match(text, /\[editorOpen, setEditorOpen\] = useState\(false\)/);
  assert.match(text, /{editorOpen &&/);
  assert.match(text, /grid-cols-3/);
  assert.match(text, /useDialogFocus\(dialogRef/);
  assert.match(text, /form="category-editor-form"/);
  assert.match(text, /categoriesApi.update\(editing.id, form\)/);
  assert.match(text, /categoriesApi.create\(form\)/);
});

test("AI settings cannot overwrite account instructions after a failed initial load", () => {
  const text = source("components/AISettings.jsx");
  assert.match(text, /busyRef.current \|\| loading \|\| !loaded/);
  assert.match(text, /disabled={loading \|\| saving \|\| !loaded}/);
  assert.doesNotMatch(text, /tasksApi\.|clearPreferences\(/);
});

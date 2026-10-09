import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../src/pages/CoupleSpace.jsx", import.meta.url), "utf8");

test("couple creation sections are native, collapsed by default and keep drafts mounted", () => {
  assert.match(text, /<details ref={sectionRef} className="group" data-couple-create>/);
  assert.doesNotMatch(text, /<details\b[^>]*\bopen(?:=|[ >])/);
  for (const title of ["Criar meta", "Criar date", "Criar nota"]) {
    assert.ok(text.includes(`<CreationSection title="${title}"`));
  }
  assert.equal((text.match(/<CreationSection /g) || []).length, 3);
  assert.match(text, /<summary className="flex min-h-14/);
  assert.match(text, /group-open:rotate-180/);
});

test("summary stays compact with three mobile columns, saved collections stay outside disclosures", () => {
  assert.match(text, /grid grid-cols-3[^\n]+data-couple-summary/);
  assert.ok(text.indexOf("Nosso cantinho especial") < text.indexOf('<CreationSection title="Criar meta"'));
  const lastCreator = text.lastIndexOf("</CreationSection>");
  for (const list of ["space.goals.map", "space.date_ideas.map", "space.notes.map"]) {
    assert.ok(text.indexOf(list) > lastCreator);
  }
});

test("all creation endpoints retain synchronous duplicate guards and disabled state", () => {
  for (const kind of ["goal", "date", "note"]) {
    assert.ok(text.includes(`if (!beginCreation("${kind}")) return;`));
    assert.ok(text.includes(`finishCreation("${kind}");`));
    assert.ok(text.includes(`<fieldset disabled={savingCreators.${kind}}`));
  }
  assert.match(text, /if \(creatingRef.current.has\(kind\)\) return false/);
  assert.match(text, /creatingRef.current.add\(kind\)/);
  assert.match(text, /creatingRef.current.delete\(kind\)/);
});

test("successful creation folds and focuses its trigger without discarding failed drafts", () => {
  for (const ref of ["goalSectionRef", "dateSectionRef", "noteSectionRef"]) {
    assert.ok(text.includes(`closeCreation(${ref});`));
  }
  assert.match(text, /section.open = false/);
  assert.match(text, /section.querySelector\("summary"\)\?\.focus\(\)/);
  assert.doesNotMatch(text, /catch \(err\) {\s*(?:[^}]*closeCreation|[^}]*set(?:Goal|Date|Note)Form\(initial)/);
});

test("existing couple actions, date-image flow and shared API contracts remain available", () => {
  for (const operation of ["get", "createGoal", "updateGoal", "deleteGoal", "createDateIdea", "updateDateIdea", "deleteDateIdea", "createNote", "updateNote", "deleteNote"]) {
    assert.ok(text.includes(`coupleApi.${operation}(`));
  }
  assert.match(text, /await dateImageRef.current\?\.getValue\(\)/);
  assert.match(text, /uploadScope="date"/);
  assert.match(text, /disabled={savingCreators.date}/);
  assert.match(text, /onRemove={clearDateImage}/);
});

test("saved content wraps long text within mobile cards", () => {
  assert.equal((text.match(/min-w-0 flex-1 \[overflow-wrap:anywhere\]/g) || []).length, 2);
  assert.match(text, /leading-relaxed \[overflow-wrap:anywhere\]">\{note.message\}/);
  assert.match(text, /\[&>p\]:max-w-full \[&_svg\]:shrink-0/);
});

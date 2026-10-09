import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dashboardStatDestinations, matchesTaskStatusFilter, normalizeTaskStatusFilter } from "../src/utils/taskStatusFilters.js";

const source = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const dashboard = source("pages/Dashboard.jsx");
const tasks = source("pages/Tasks.jsx");
const rows = ["pendente", "em_andamento", "atrasada", "concluida"].map((status, id) => ({ id, status }));

test("status URL accepts known filters and falls back safely for invalid input", () => {
  for (const key of ["all", "pendente", "concluida", "atrasada"]) assert.equal(normalizeTaskStatusFilter(key), key);
  for (const key of [null, undefined, "", "done", "__proto__", "em_andamento"]) assert.equal(normalizeTaskStatusFilter(key), "all");
});

test("Pendentes includes in-progress but not overdue or completed, matching dashboard count", () => {
  assert.deepEqual(rows.filter((row) => matchesTaskStatusFilter(row, "pendente")).map((row) => row.status), ["pendente", "em_andamento"]);
});

test("Concluídas selects only completed tasks", () => {
  assert.deepEqual(rows.filter((row) => matchesTaskStatusFilter(row, "concluida")).map((row) => row.status), ["concluida"]);
});

test("Atrasadas selects only overdue tasks", () => {
  assert.deepEqual(rows.filter((row) => matchesTaskStatusFilter(row, "atrasada")).map((row) => row.status), ["atrasada"]);
});

test("Todas and unknown filters preserve all data without changing task status", () => {
  const original = JSON.stringify(rows);
  for (const filter of ["all", "unknown"]) assert.deepEqual(rows.filter((row) => matchesTaskStatusFilter(row, filter)), rows);
  assert.equal(JSON.stringify(rows), original);
});

test("dashboard cards open matching task filters or the monthly ranking", () => {
  assert.deepEqual(dashboardStatDestinations, { done: "/tarefas?status=concluida", pending: "/tarefas?status=pendente", overdue: "/tarefas?status=atrasada", points: "/ranking" });
  assert.match(dashboard, /to=\{dashboardStatDestinations\[item.key\]\}/);
});

test("cards use actual links or buttons with selected state; passive cards retain their defaults", () => {
  const stat = source("components/StatCard.jsx");
  const card = source("components/Card.jsx");
  assert.match(stat, /as=\{to \? Link : onClick \? "button" : "section"\}/);
  assert.match(stat, /aria-pressed=\{onClick && !to \? active : undefined\}/);
  assert.match(stat, /compact = false/);
  assert.match(card, /as: Component = "section"/);
  assert.match(card, /\{\.\.\.props\}/);
});

test("disclosures expose keyboard-native controls, unique content IDs and keep non-lazy children mounted", () => {
  const section = source("components/CollapsibleSection.jsx");
  assert.match(section, /useId\(\)/);
  assert.match(section, /<button\s+type="button"/);
  assert.match(section, /aria-expanded=\{expanded\}/);
  assert.match(section, /aria-controls=\{contentId\}/);
  assert.match(section, /hidden=\{!expanded\}/);
  assert.match(section, /min-h-14/);
  assert.match(section, /choice \?\? defaultOpen/);
});

test("dashboard automatically folds empty task sections, defers chart until opened", () => {
  for (const collection of ["overdueTasks", "upcomingTasks", "recentTasks"]) assert.ok(dashboard.includes(`defaultOpen={${collection}.length > 0}`));
  assert.match(dashboard, /title="Produtividade da semana"[^>]*lazy/);
  assert.doesNotMatch(dashboard, /min-h-44/);
  assert.doesNotMatch(dashboard, /xl:grid-cols-\[1\.15fr_1fr\]/);
});

test("Tasks cards select filters, preserve search URL and browser history, remove redundant status tabs", () => {
  for (const key of ["all", "pendente", "concluida", "atrasada"]) assert.ok(tasks.includes(`onClick={() => selectStatus("${key}")}`));
  assert.match(tasks, /new URLSearchParams\(current\)/);
  assert.match(tasks, /next.set\("status", nextStatus\)/);
  assert.match(tasks, /next.set\("search", value\)/);
  assert.match(tasks, /setStatus\(nextStatus\)/);
  assert.doesNotMatch(tasks, /statusTabs/);
});

test("extra filters and completed history are compact without removing existing task actions", () => {
  assert.match(tasks, /<CollapsibleSection title="Mais filtros"/);
  assert.match(tasks, /defaultOpen=\{status === "concluida" && completedTasks.length > 0\}/);
  for (const handler of ["onComplete={handleComplete}", "onEdit={openEditor}", "onDelete={requestTaskDelete}", "onOpenDetails={openDetails}"]) assert.ok(tasks.includes(handler));
  assert.match(tasks, /Limpar filtros/);
  assert.match(tasks, /advancedFilterCount > 0/);
});

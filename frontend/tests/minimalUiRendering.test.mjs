import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { buildMonthDays, getWeekdayLabels } from "../src/utils/preferences.js";
import { groupCalendarTasksByDay, localCalendarDateKey } from "../src/utils/calendar.js";

let server;
let MonthCalendarGrid;
let TaskList;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  MonthCalendarGrid = (await server.ssrLoadModule("/src/components/MonthCalendarGrid.jsx")).default;
  TaskList = (await server.ssrLoadModule("/src/components/TaskList.jsx")).default;
});
after(async () => { await server?.close(); });

const tasks = Array.from({ length: 5 }, (_, index) => ({
  id: `qa-${index}`, title: `Compromisso ${index + 1}`, due_date: "2026-10-09T15:00:00Z", status: index === 0 ? "concluida" : "pendente", priority: "media",
  creator: { name: "Autor detalhado" }, assignee: { id: "qa", name: "QA Local" }
}));
const renderMonth = (overrides = {}) => renderToStaticMarkup(React.createElement(MonthCalendarGrid, {
  days: buildMonthDays(new Date(2026, 9, 9), "monday"), baseDate: new Date(2026, 9, 9), weekdayLabels: getWeekdayLabels("monday"),
  tasksByDay: groupCalendarTasksByDay(tasks, "America/Sao_Paulo"), onOpenDay() {}, onOpenTask() {}, ...overrides
}));

test("month grid renders all 42 dates and seven weekday headers, including empty days", () => {
  const html = renderMonth();
  assert.equal((html.match(/data-calendar-day=/g) || []).length, 42);
  for (const label of getWeekdayLabels("monday")) assert.ok(html.includes(`>${label}</span>`));
  assert.ok(html.includes("0 tarefas. Ver dia"));
  assert.ok(html.includes("grid-cols-7"));
  assert.ok(!html.includes("min-w-[760px]"));
});

test("mobile shows two chips and a remaining-count action; desktop shows three", () => {
  const html = renderMonth();
  assert.equal((html.match(/Ver detalhes de Compromisso/g) || []).length, 3);
  assert.ok(html.includes(">+3</button>"));
  assert.ok(html.includes(">+2 tarefas</button>"));
  assert.ok(html.includes("Ver as 5 tarefas de 9 de outubro de 2026"));
  assert.ok(html.includes("hidden sm:block"));
});

test("completed events remain visible and marked, selection does not hide the month", () => {
  const html = renderMonth({ selectedDate: new Date(2026, 9, 9) });
  assert.ok(html.includes("line-through"));
  assert.ok(html.includes("calendar-day-selected"));
  assert.equal((html.match(/data-calendar-day=/g) || []).length, 42);
});

test("month boundaries are contiguous for Sunday/Monday and leap-year February", () => {
  for (const weekStart of ["sunday", "monday"]) {
    for (const base of [new Date(2026, 7, 1), new Date(2028, 1, 1), new Date(2026, 11, 1)]) {
      const days = buildMonthDays(base, weekStart);
      assert.equal(days.length, 42);
      assert.equal(days[0].getDay(), weekStart === "sunday" ? 0 : 1);
      assert.equal(new Set(days.map(localCalendarDateKey)).size, 42);
      assert.ok(days.some((day) => day.getFullYear() === base.getFullYear() && day.getMonth() === base.getMonth() && day.getDate() === new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
      days.slice(1).forEach((day, index) => { const previous = new Date(days[index]); previous.setDate(previous.getDate() + 1); assert.equal(localCalendarDateKey(day), localCalendarDateKey(previous)); });
    }
  }
});

test("compact task rows retain title, date, status, assignee and keyboard/action controls", () => {
  const html = renderToStaticMarkup(React.createElement(TaskList, { tasks, onOpenDetails() {}, onComplete() {}, onEdit() {}, onDelete() {} }));
  assert.ok(html.includes("data-compact-task"));
  assert.ok(html.includes("Ver detalhes de Compromisso 1"));
  assert.ok(html.includes("Reabrir Compromisso 1"));
  assert.ok(html.includes("Concluir Compromisso 2"));
  assert.ok(html.includes("Acoes de Compromisso 1"));
  assert.ok(html.includes("Responsáveis: QA Local"));
  assert.ok(!html.includes("Criado por Autor detalhado"));
  assert.ok(html.includes('tabindex="0"'));
});

test("family editor is on-demand, keeps active-family scope and role checks", () => {
  const source = readFileSync(new URL("../src/pages/Family.jsx", import.meta.url), "utf8");
  assert.match(source, /onClick=\{\(\) => openFamilySettings\(family\)\}/);
  assert.match(source, /families\[0\]\?\.id === settingsFamilyId/);
  assert.match(source, /await switchFamily\(family.id\)/);
  assert.match(source, /settingsOpen && currentFamily && createPortal/);
  assert.match(source, /useDialogFocus\(settingsDialogRef, settingsOpen, closeSettings\)/);
  assert.match(source, /canAdmin && <Button type="submit"/);
  assert.match(source, /canOwner && <Button type="button" variant="danger"/);
  assert.match(source, /await familiesApi.updateCurrent/);
  assert.ok(!source.includes('<h2 className="section-title">Configuracoes da familia</h2>'));
});

test("AI copy is concise while review, opt-in and unavailable-provider feedback remain", () => {
  const source = readFileSync(new URL("../src/components/ImageTaskImportPanel.jsx", import.meta.url), "utf8");
  for (const verbose of ["Escolha uma imagem e revise as sugestões antes de criar.", "Explique a imagem ou dê orientações", "Modelo: ${providerStatus.model}"]) assert.ok(!source.includes(verbose));
  assert.ok(source.includes("Ex.: Provas da faculdade. Uma tarefa por prova, para Kauan."));
  assert.ok(source.includes("Analise, revise e confirme as tarefas sugeridas."));
  assert.ok(source.includes("Revisao obrigatoria"));
  assert.ok(source.includes("handleImportSuggestions"));
  assert.ok(source.includes("imageContextMaxLength = 1500"));
  assert.ok(source.includes("providerStatus?.message"));
  assert.ok(source.includes("GoogleCalendarOptIn"));
});

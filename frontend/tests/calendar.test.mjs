import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarDateKey,
  calendarTimeLabel,
  filterCalendarTasks,
  groupCalendarTasksByDay,
  UNASSIGNED_FILTER,
  UNCATEGORIZED_FILTER
} from "../src/utils/calendar.js";

const tasks = [
  { id: "1", title: "Casa", due_date: "2026-06-21T02:30:00.000Z", assignee_ids: ["bia"], category_id: "casa", status: "pendente" },
  { id: "2", title: "Mercado", due_date: "2026-06-21T12:00:00.000Z", assignee_ids: ["kauan"], category_id: "casa", status: "concluida" },
  { id: "3", title: "Livre", due_date: null, assignee_ids: [], category_id: null, status: "pendente" }
];

test("calendar groups near-midnight tasks in the configured timezone", () => {
  assert.equal(calendarDateKey(tasks[0].due_date, "America/Sao_Paulo"), "2026-06-20");
  assert.equal(calendarDateKey(tasks[0].due_date, "UTC"), "2026-06-21");
  assert.deepEqual(Object.keys(groupCalendarTasksByDay(tasks, "America/Sao_Paulo")), ["2026-06-20", "2026-06-21"]);
});

test("calendar filters combine member and category without dropping completed tasks", () => {
  assert.deepEqual(filterCalendarTasks(tasks, { memberId: "bia", categoryId: "casa" }).map((task) => task.id), ["1"]);
  assert.deepEqual(filterCalendarTasks(tasks, { memberId: "kauan", categoryId: "casa" }).map((task) => task.id), ["2"]);
  assert.deepEqual(filterCalendarTasks(tasks, { memberId: UNASSIGNED_FILTER, categoryId: UNCATEGORIZED_FILTER }).map((task) => task.id), ["3"]);
});

test("calendar ignores missing dates safely and recognizes date-only import convention", () => {
  assert.equal(calendarDateKey(null, "America/Sao_Paulo"), "");
  assert.equal(calendarTimeLabel("2026-06-22T02:59:00.000Z", "America/Sao_Paulo"), "Sem horário");
  assert.equal(calendarTimeLabel("2026-06-21T12:30:00.000Z", "America/Sao_Paulo"), "09:30");
});

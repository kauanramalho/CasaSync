import { findColor } from "./categoryDesign";
import { normalizeReminderList } from "./taskReminders";

const taskSortCollator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export const priorityPoints = {
  baixa: 5,
  media: 10,
  alta: 20
};

const prioritySortRank = {
  alta: 0,
  media: 1,
  baixa: 2
};

export const taskSortColumns = [
  { key: "title", label: "Tarefa" },
  { key: "category", label: "Categoria" },
  { key: "assignees", label: "Responsaveis" },
  { key: "priority", label: "Prioridade" },
  { key: "due_date", label: "Prazo" },
  { key: "status", label: "Status" }
];

export function isTaskCompleted(task) {
  return task?.status === "concluida";
}

export function isTaskOpen(task) {
  return !isTaskCompleted(task);
}

export const categoryToneClasses = {
  rose: "bg-rose-50 text-rose-600 border-rose-100",
  blush: "bg-rose-50 text-blush border-rose-100",
  coral: "bg-red-50 text-red-500 border-red-100",
  peach: "bg-orange-50 text-orange-500 border-orange-100",
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  sky: "bg-sky-50 text-sky-600 border-sky-100",
  indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
  mint: "bg-emerald-50 text-emerald-500 border-emerald-100",
  green: "bg-green-50 text-green-600 border-green-100",
  garden: "bg-green-50 text-green-500 border-green-100",
  violet: "bg-violet-50 text-violet-600 border-violet-100",
  lavender: "bg-violet-50 text-lavender border-violet-100",
  purple: "bg-purple-50 text-purple-600 border-purple-100",
  mauve: "bg-fuchsia-50 text-fuchsia-500 border-fuchsia-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  butter: "bg-yellow-50 text-yellow-600 border-yellow-100",
  orange: "bg-orange-50 text-orange-600 border-orange-100",
  cyan: "bg-cyan-50 text-cyan-600 border-cyan-100",
  teal: "bg-teal-50 text-teal-600 border-teal-100",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  zinc: "bg-zinc-100 text-zinc-600 border-zinc-200",
  stone: "bg-stone-100 text-stone-600 border-stone-200",
  charcoal: "bg-slate-100 text-slate-700 border-slate-200",
  cream: "bg-orange-50 text-orange-700 border-orange-100",
  wine: "bg-rose-100 text-rose-800 border-rose-200",
  pink: "bg-pink-50 text-pink-600 border-pink-100"
};

export const categoryNameToneClasses = {
  Relacionamento: categoryToneClasses.rose,
  Casa: categoryToneClasses.blue,
  Faculdade: categoryToneClasses.emerald,
  Estudos: categoryToneClasses.violet,
  Igreja: categoryToneClasses.purple,
  Trabalho: categoryToneClasses.slate,
  Saude: categoryToneClasses.green,
  "Saúde": categoryToneClasses.green,
  Compras: categoryToneClasses.amber,
  Financas: categoryToneClasses.cyan,
  "Finanças": categoryToneClasses.cyan,
  Pessoal: categoryToneClasses.pink
};

export function getTaskAssignees(task) {
  if (task?.assignees?.length) return task.assignees;
  if (task?.assignee) return [task.assignee];
  return [];
}

export function getTaskAssigneeIds(task) {
  if (task?.assignee_ids?.length) return task.assignee_ids;
  if (task?.assignee_id) return [task.assignee_id];
  return getTaskAssignees(task).map((user) => user.id).filter(Boolean);
}

export function getAssigneeNames(task, fallback = "Sem responsavel") {
  const names = getTaskAssignees(task).map((user) => user.name).filter(Boolean);
  if (!names.length) return fallback;
  return new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(names);
}

function safeDateTime(value, fallback = Number.MAX_SAFE_INTEGER) {
  const time = value ? new Date(value).getTime() : fallback;
  return Number.isNaN(time) ? fallback : time;
}

function sortDirectionFactor(direction) {
  return direction === "desc" ? -1 : 1;
}

function safeComparableDate(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function taskStatusGroup(task) {
  if (task?.status === "concluida") return 2;
  if (task?.status === "atrasada") return 0;
  return 1;
}

function taskStatusRank(task) {
  const ranks = {
    atrasada: 0,
    em_andamento: 1,
    pendente: 2,
    concluida: 3
  };
  return ranks[task?.status] ?? 2;
}

function compareText(left, right) {
  return taskSortCollator.compare(left || "", right || "");
}

function compareDateWithEmptyLast(left, right, direction) {
  const leftTime = safeComparableDate(left);
  const rightTime = safeComparableDate(right);
  const leftEmpty = leftTime === null;
  const rightEmpty = rightTime === null;

  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  return sortDirectionFactor(direction) * (leftTime - rightTime);
}

function compareManualTaskColumn(left, right, sort) {
  const direction = sort?.direction === "desc" ? "desc" : "asc";
  const factor = sortDirectionFactor(direction);

  switch (sort?.key) {
    case "title":
      return factor * compareText(left?.title, right?.title);
    case "category":
      return factor * compareText(getCategoryName(left?.category, ""), getCategoryName(right?.category, ""));
    case "assignees":
      return factor * compareText(getAssigneeNames(left, ""), getAssigneeNames(right, ""));
    case "priority":
      return factor * ((prioritySortRank[left?.priority] ?? 1) - (prioritySortRank[right?.priority] ?? 1));
    case "due_date":
      return compareDateWithEmptyLast(left?.due_date, right?.due_date, direction);
    case "status":
      return factor * (taskStatusRank(left) - taskStatusRank(right));
    default:
      return 0;
  }
}

export function getNextTaskSort(currentSort, columnKey) {
  if (!taskSortColumns.some((column) => column.key === columnKey)) return null;
  const direction = currentSort?.key === columnKey && currentSort.direction !== "desc" ? "desc" : "asc";
  return { key: columnKey, direction };
}

export function compareTasksForDisplay(left, right) {
  const statusGroupDelta = taskStatusGroup(left) - taskStatusGroup(right);
  if (statusGroupDelta) return statusGroupDelta;

  const dueDateDelta = safeDateTime(left?.due_date) - safeDateTime(right?.due_date);
  if (dueDateDelta) return dueDateDelta;

  const priorityDelta = (prioritySortRank[left?.priority] ?? 1) - (prioritySortRank[right?.priority] ?? 1);
  if (priorityDelta) return priorityDelta;

  const statusDelta = taskStatusRank(left) - taskStatusRank(right);
  if (statusDelta) return statusDelta;

  const categoryDelta = compareText(getCategoryName(left?.category, ""), getCategoryName(right?.category, ""));
  if (categoryDelta) return categoryDelta;

  const createdAtDelta = safeDateTime(right?.created_at, 0) - safeDateTime(left?.created_at, 0);
  if (createdAtDelta) return createdAtDelta;

  const assigneeDelta = compareText(getAssigneeNames(left, ""), getAssigneeNames(right, ""));
  if (assigneeDelta) return assigneeDelta;

  return compareText(left?.title, right?.title);
}

export function sortTasksForDisplay(tasks = [], manualSort = null) {
  return [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const manualDelta = manualSort?.key ? compareManualTaskColumn(left.task, right.task, manualSort) : 0;
      return manualDelta || compareTasksForDisplay(left.task, right.task) || left.index - right.index;
    })
    .map((item) => item.task);
}

export function getTaskPointLabel(task) {
  if (task?.assignee_points?.length > 1) {
    const points = task.assignee_points.map((item) => `${item.user?.name || "Pessoa"}: ${item.points} pts`);
    return points.join(" · ");
  }
  const points = task?.assignee_points?.[0]?.points ?? task?.points_awarded ?? priorityPoints[task?.priority] ?? 0;
  return `${points} pts`;
}

export function getCategoryTone(category) {
  const color = typeof category === "string" ? null : category?.color;
  const name = typeof category === "string" ? category : category?.name || category?.category;
  return categoryToneClasses[color] || categoryNameToneClasses[name] || "bg-slate-100 text-slate-600 border-slate-200";
}

export function getCategoryName(category, fallback = "Sem categoria") {
  if (typeof category === "string") return category || fallback;
  return category?.name || category?.category || fallback;
}

export function getCategoryColorKey(category) {
  if (!category || typeof category === "string") return null;
  return category.color || category.tasks?.[0]?.category?.color || null;
}

export function getCategoryHex(category, fallback = "#94a3b8") {
  const color = findColor(getCategoryColorKey(category));
  return color?.hex || fallback;
}

export function getCategoryIconKey(category) {
  if (!category || typeof category === "string") return "sparkles";
  return category.icon || category.tasks?.[0]?.category?.icon || "sparkles";
}

export function getCategoryMeta(category) {
  return {
    name: getCategoryName(category),
    color: getCategoryColorKey(category),
    hex: getCategoryHex(category),
    icon: getCategoryIconKey(category),
    tone: getCategoryTone(category)
  };
}

export function normalizeTaskForForm(task) {
  const reminders = normalizeReminderList(task || {});
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    assignee_ids: getTaskAssigneeIds(task),
    category_id: task?.category_id ?? "",
    due_date: task?.due_date ?? "",
    priority: task?.priority ?? "media",
    status: task?.status ?? "pendente",
    reminders,
    reminder_enabled: reminders.length > 0 || Boolean(task?.reminder_enabled ?? task?.reminderEnabled),
    reminder_value: reminders[0]?.value ?? task?.reminder_value ?? task?.reminderValue ?? null,
    reminder_unit: reminders[0]?.unit ?? task?.reminder_unit ?? task?.reminderUnit ?? null,
    reminder_at: task?.reminder_at ?? task?.reminderAt ?? null,
    reminder_sent: Boolean(task?.reminder_sent ?? task?.reminderSent)
  };
}

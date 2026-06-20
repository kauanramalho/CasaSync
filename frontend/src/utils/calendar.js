export const UNASSIGNED_FILTER = "__unassigned__";
export const UNCATEGORIZED_FILTER = "__uncategorized__";

function taskAssigneeIds(task) {
  if (task?.assignee_ids?.length) return task.assignee_ids;
  if (task?.assignee_id) return [task.assignee_id];
  return (task?.assignees || (task?.assignee ? [task.assignee] : [])).map((user) => user.id).filter(Boolean);
}

function sortCalendarRows(tasks) {
  return [...tasks].sort((left, right) => {
    const leftTime = left?.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right?.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left?.title || "").localeCompare(String(right?.title || ""), "pt-BR");
  });
}

function dateParts(value, timezone) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? values : null;
}

export function calendarDateKey(value, timezone = "America/Sao_Paulo") {
  const parts = dateParts(value, timezone);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

export function localCalendarDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarTimeLabel(value, timezone = "America/Sao_Paulo") {
  if (!value) return "Sem horário";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem horário";
  const label = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone
  }).format(date);
  return label === "23:59" ? "Sem horário" : label;
}

export function filterCalendarTasks(tasks = [], { memberId = "", categoryId = "" } = {}) {
  return tasks.filter((task) => {
    const assigneeIds = taskAssigneeIds(task);
    const matchesMember = !memberId
      || (memberId === UNASSIGNED_FILTER ? assigneeIds.length === 0 : assigneeIds.includes(memberId));
    const matchesCategory = !categoryId
      || (categoryId === UNCATEGORIZED_FILTER ? !task.category_id && !task.category?.id : (task.category_id || task.category?.id) === categoryId);
    return matchesMember && matchesCategory;
  });
}

export function groupCalendarTasksByDay(tasks = [], timezone = "America/Sao_Paulo") {
  const buckets = {};
  tasks.forEach((task) => {
    const key = task?.due_date ? calendarDateKey(task.due_date, timezone) : "";
    if (!key) return;
    buckets[key] = [...(buckets[key] || []), task];
  });
  Object.keys(buckets).forEach((key) => {
    buckets[key] = sortCalendarRows(buckets[key]);
  });
  return buckets;
}

export function calendarMonthTasks(tasks = [], baseDate, timezone = "America/Sao_Paulo") {
  const monthKey = localCalendarDateKey(baseDate).slice(0, 7);
  return sortCalendarRows(tasks.filter((task) => calendarDateKey(task?.due_date, timezone).startsWith(monthKey)));
}

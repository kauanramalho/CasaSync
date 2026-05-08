export const priorityPoints = {
  baixa: 5,
  media: 10,
  alta: 20
};

export const memberChartColors = ["#f85d8f", "#7aa5ff", "#63c982", "#9d7cf4", "#ffc77d", "#61c9d6"];

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
  const name = typeof category === "string" ? category : category?.name;
  return categoryToneClasses[color] || categoryNameToneClasses[name] || "bg-slate-100 text-slate-600 border-slate-200";
}

export function normalizeTaskForForm(task) {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    assignee_ids: getTaskAssigneeIds(task),
    category_id: task?.category_id ?? "",
    due_date: task?.due_date ?? "",
    priority: task?.priority ?? "media",
    status: task?.status ?? "pendente"
  };
}

export function buildProductivityRows(points = []) {
  return points.map((point) => {
    const row = { ...point };
    (point.members || []).forEach((memberPoint) => {
      const key = memberPoint.user?.id;
      if (!key) return;
      row[`member_${key}`] = memberPoint.total;
      row[`member_${key}_points`] = memberPoint.points;
      row[`member_${key}_tasks`] = memberPoint.tasks || [];
      row[`member_${key}_user`] = memberPoint.user;
    });
    return row;
  });
}

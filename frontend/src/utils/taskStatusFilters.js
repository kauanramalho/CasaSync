export const taskStatusFilters = [
  { key: "all", label: "Todas" },
  { key: "pendente", label: "Pendentes" },
  { key: "concluida", label: "Concluídas" },
  { key: "atrasada", label: "Atrasadas" }
];

export function normalizeTaskStatusFilter(value) {
  return taskStatusFilters.some((filter) => filter.key === value) ? value : "all";
}

export function matchesTaskStatusFilter(task, filter) {
  const status = normalizeTaskStatusFilter(filter);
  if (status === "all") return true;
  if (status === "pendente") return ["pendente", "em_andamento"].includes(task?.status);
  return task?.status === status;
}

export const dashboardStatDestinations = {
  done: "/tarefas?status=concluida",
  pending: "/tarefas?status=pendente",
  overdue: "/tarefas?status=atrasada",
  points: "/ranking"
};

import clsx from "clsx";

import { priorityLabels, statusLabels } from "../utils/formatters";

const categoryClasses = {
  Relacionamento: "bg-rose-50 text-rose-600",
  Casa: "bg-blue-50 text-blue-600",
  Faculdade: "bg-emerald-50 text-emerald-600",
  Estudos: "bg-violet-50 text-violet-600",
  Igreja: "bg-purple-50 text-purple-600",
  Trabalho: "bg-slate-100 text-slate-600",
  Saúde: "bg-green-50 text-green-600",
  Compras: "bg-amber-50 text-amber-600",
  Finanças: "bg-cyan-50 text-cyan-600",
  Pessoal: "bg-pink-50 text-pink-600"
};

const priorityClasses = {
  baixa: "bg-emerald-50 text-emerald-600",
  media: "bg-orange-50 text-orange-600",
  alta: "bg-rose-50 text-rose-600"
};

const statusClasses = {
  pendente: "bg-orange-50 text-orange-600",
  em_andamento: "bg-blue-50 text-blue-600",
  concluida: "bg-emerald-50 text-emerald-600",
  atrasada: "bg-rose-50 text-rose-600"
};

function Pill({ children, className }) {
  return <span className={clsx("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", className)}>{children}</span>;
}

export function CategoryBadge({ category }) {
  const name = typeof category === "string" ? category : category?.name;
  return <Pill className={categoryClasses[name] || "bg-slate-100 text-slate-600"}>{name || "Sem categoria"}</Pill>;
}

export function PriorityBadge({ priority }) {
  return <Pill className={priorityClasses[priority] || priorityClasses.media}>{priorityLabels[priority] || "Média"}</Pill>;
}

export function StatusBadge({ status }) {
  return <Pill className={statusClasses[status] || statusClasses.pendente}>{statusLabels[status] || "Pendente"}</Pill>;
}


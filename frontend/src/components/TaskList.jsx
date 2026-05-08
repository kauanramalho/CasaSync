import { Check, MoreHorizontal } from "lucide-react";

import Avatar from "./Avatar";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./Badges";
import { formatDate } from "../utils/formatters";

export default function TaskList({ tasks = [], onComplete, compact = false }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white/70">
      <div className="hidden grid-cols-[44px_1.8fr_1fr_1fr_1fr_0.8fr_1fr_44px] gap-4 border-b border-slate-100 px-5 py-4 text-sm font-medium text-muted md:grid">
        <span />
        <span>Tarefa</span>
        <span>Categoria</span>
        <span>Responsável</span>
        <span>Prioridade</span>
        <span>Prazo</span>
        <span>Status</span>
        <span />
      </div>
      <div className="divide-y divide-slate-100">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="grid gap-3 px-5 py-4 md:grid-cols-[44px_1.8fr_1fr_1fr_1fr_0.8fr_1fr_44px] md:items-center md:gap-4"
          >
            <button
              onClick={() => onComplete?.(task)}
              className={`grid h-6 w-6 place-items-center rounded-md border transition ${
                task.status === "concluida" ? "border-emerald-400 bg-emerald-400 text-white" : "border-slate-300 text-transparent hover:border-emerald-300"
              }`}
              title="Concluir tarefa"
            >
              <Check className="h-4 w-4" />
            </button>
            <div>
              <p className="font-semibold text-ink">{task.title}</p>
              {!compact && (
                <p className="mt-1 text-xs text-muted">
                  Criado por {task.creator?.name || "CasaSync"} · {task.status === "concluida" ? "Concluída" : "Prazo"}: {formatDate(task.due_date)}
                </p>
              )}
            </div>
            <CategoryBadge category={task.category} />
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Avatar user={task.assignee} size="sm" />
              {task.assignee?.name || "Sem responsável"}
            </div>
            <PriorityBadge priority={task.priority} />
            <span className="text-sm text-muted">{formatDate(task.due_date)}</span>
            <StatusBadge status={task.status} />
            <button className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-slate-100">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        ))}
        {tasks.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">Nenhuma tarefa encontrada.</div>}
      </div>
    </div>
  );
}

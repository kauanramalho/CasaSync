import { useState } from "react";
import { Check, Edit3, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

import Avatar from "./Avatar";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./Badges";
import { formatDate } from "../utils/formatters";
import { getAssigneeNames, getTaskAssignees } from "../utils/tasks";

function AssigneeStack({ task }) {
  const assignees = getTaskAssignees(task);
  if (!assignees.length) return <span className="text-sm font-medium text-muted">Sem responsável</span>;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
      <div className="flex -space-x-2">
        {assignees.slice(0, 4).map((assignee) => (
          <Avatar key={assignee.id} user={assignee} size="sm" />
        ))}
      </div>
      <span className="truncate">{getAssigneeNames(task)}</span>
    </div>
  );
}

export default function TaskList({ tasks = [], onComplete, onEdit, onRemoveRecent, compact = false }) {
  const [openMenuId, setOpenMenuId] = useState(null);

  function toggleMenu(taskId) {
    setOpenMenuId((current) => (current === taskId ? null : taskId));
  }

  function runAction(action, task) {
    setOpenMenuId(null);
    action?.(task);
  }

  return (
    <div className="overflow-visible rounded-[24px] border border-slate-100 bg-white/70">
      <div className="hidden grid-cols-[44px_1.8fr_1fr_1.15fr_1fr_0.8fr_1fr_44px] gap-4 border-b border-slate-100 px-5 py-4 text-sm font-medium text-muted md:grid">
        <span />
        <span>Tarefa</span>
        <span>Categoria</span>
        <span>Responsáveis</span>
        <span>Prioridade</span>
        <span>Prazo</span>
        <span>Status</span>
        <span />
      </div>
      <div className="divide-y divide-slate-100">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="grid gap-3 px-5 py-4 md:grid-cols-[44px_1.8fr_1fr_1.15fr_1fr_0.8fr_1fr_44px] md:items-center md:gap-4"
          >
            <button
              onClick={() => onComplete?.(task)}
              className={`grid h-6 w-6 place-items-center rounded-md border transition ${
                task.status === "concluida" ? "border-emerald-400 bg-emerald-400 text-white" : "border-slate-300 text-transparent hover:border-emerald-300"
              }`}
              title={task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
            >
              <Check className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{task.title}</p>
              {!compact && (
                <p className="mt-1 text-xs text-muted">
                  Criado por {task.creator?.name || "CasaSync"} · {task.status === "concluida" ? "Concluída" : "Prazo"}: {formatDate(task.due_date)}
                </p>
              )}
            </div>
            <CategoryBadge category={task.category} />
            <AssigneeStack task={task} />
            <PriorityBadge priority={task.priority} />
            <span className="text-sm text-muted">{formatDate(task.due_date)}</span>
            <StatusBadge status={task.status} />
            <div className="relative">
              <button
                onClick={() => toggleMenu(task.id)}
                className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-slate-100"
                title="Ações da tarefa"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {openMenuId === task.id && (
                <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white p-1 shadow-card">
                  {onEdit && (
                    <button onClick={() => runAction(onEdit, task)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-blue-50">
                      <Edit3 className="h-4 w-4 text-blue-500" />
                      Editar tarefa
                    </button>
                  )}
                  <button onClick={() => runAction(onComplete, task)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-emerald-50">
                    <RotateCcw className="h-4 w-4 text-emerald-500" />
                    {task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
                  </button>
                  {onRemoveRecent && (
                    <button onClick={() => runAction(onRemoveRecent, task)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                      Remover das recentes
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {tasks.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">Nenhuma tarefa encontrada.</div>}
      </div>
    </div>
  );
}


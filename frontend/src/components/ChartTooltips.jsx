import Avatar from "./Avatar";
import { statusLabels } from "../utils/formatters";
import { getAssigneeNames, getTaskPointLabel } from "../utils/tasks";

function TooltipShell({ children }) {
  return (
    <div className="max-w-[320px] rounded-2xl border border-rose-100 bg-white/95 p-4 text-sm text-ink shadow-card backdrop-blur">
      {children}
    </div>
  );
}

function TaskRows({ tasks = [], showStatus = false }) {
  if (!tasks.length) {
    return <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-muted">Nenhuma tarefa concluída neste ponto.</p>;
  }

  return (
    <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
      {tasks.map((task) => (
        <div key={task.id} className="rounded-xl bg-rose-50/60 px-3 py-2">
          <p className="font-semibold text-ink">{task.title}</p>
          <p className="mt-1 text-xs text-muted">
            {getAssigneeNames(task)} · {getTaskPointLabel(task)}
            {showStatus ? ` · ${statusLabels[task.status] || task.status}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

export function WeeklyTasksTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <TooltipShell>
      <p className="font-bold text-ink">Data: {point.label}</p>
      <p className="mt-1 text-sm font-semibold text-blush">Total: {point.total} tarefas</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">Tarefas</p>
      <TaskRows tasks={point.tasks} />
    </TooltipShell>
  );
}

export function CategoryTasksTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const category = payload[0].payload;
  return (
    <TooltipShell>
      <p className="font-bold text-ink">{category.category}</p>
      <p className="mt-1 text-sm font-semibold text-blue-500">{category.total} tarefas</p>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">Lista</p>
      <TaskRows tasks={category.tasks} showStatus />
    </TooltipShell>
  );
}

export function MemberProductivityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const members = (point.members || []).filter((member) => member.total > 0 || member.points > 0);

  return (
    <TooltipShell>
      <p className="font-bold text-ink">Data: {point.label}</p>
      <p className="mt-1 text-sm font-semibold text-blush">Total: {point.total} tarefas</p>
      <div className="mt-3 max-h-60 space-y-3 overflow-y-auto pr-1">
        {members.length ? (
          members.map((memberPoint) => (
            <div key={memberPoint.user.id} className="rounded-2xl bg-slate-50/90 p-3">
              <div className="flex items-center gap-2">
                <Avatar user={memberPoint.user} size="sm" />
                <div>
                  <p className="font-semibold text-ink">{memberPoint.user.name}</p>
                  <p className="text-xs text-muted">
                    {memberPoint.total} concluídas · {memberPoint.points} pts
                  </p>
                </div>
              </div>
              <TaskRows tasks={memberPoint.tasks} />
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-muted">Nenhum membro pontuou nesta data.</p>
        )}
      </div>
    </TooltipShell>
  );
}


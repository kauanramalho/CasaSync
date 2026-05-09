import Avatar from "./Avatar";
import { CategoryBadge } from "./Badges";
import { statusLabels } from "../utils/formatters";
import { getAssigneeNames, getTaskPointLabel } from "../utils/tasks";

const statusTone = {
  done: "bg-emerald-50 text-emerald-700 border-emerald-100",
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  overdue: "bg-rose-50 text-rose-700 border-rose-100",
  neutral: "bg-slate-50 text-slate-600 border-slate-100"
};

function TooltipShell({ children }) {
  return (
    <div
      className="max-h-[min(420px,calc(100vh-2rem))] max-w-[min(360px,calc(100vw-2rem))] overflow-y-auto overflow-x-hidden rounded-[22px] border border-slate-200 bg-white/95 p-4 text-sm text-ink shadow-soft backdrop-blur-xl animate-in"
      onWheel={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

function TaskRows({ tasks = [], label = "Tarefas", tone = "neutral", showStatus = false }) {
  if (!tasks.length) return null;

  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
        {tasks.map((task) => (
          <div key={task.id} className={`rounded-2xl border px-3 py-2 ${statusTone[tone] || statusTone.neutral}`}>
            <p className="font-semibold text-ink">{task.title}</p>
            <p className="mt-1 text-xs opacity-80">
              {getAssigneeNames(task)} - {getTaskPointLabel(task)}
              {showStatus ? ` - ${statusLabels[task.status] || task.status}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeeklyTasksTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const doneTasks = point.doneTasks || point.tasks || [];
  const pendingTasks = point.pendingTasks || [];
  const overdueTasks = point.overdueTasks || [];

  return (
    <TooltipShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-ink">Data: {point.label}</p>
          <p className="mt-1 text-sm font-semibold text-blush">{point.total || 0} tarefas no radar</p>
        </div>
        <div className="rounded-2xl bg-rose-50 px-3 py-2 text-right text-xs font-bold text-blush shadow-card">
          {point.done || point.total || 0} feitas
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold">
        <span className="rounded-2xl bg-emerald-50 px-2 py-2 text-emerald-700">{point.done || 0} concluidas</span>
        <span className="rounded-2xl bg-amber-50 px-2 py-2 text-amber-700">{point.pending || 0} pendentes</span>
        <span className="rounded-2xl bg-rose-50 px-2 py-2 text-rose-700">{point.overdue || 0} atrasadas</span>
      </div>
      <TaskRows tasks={doneTasks} label="Concluidas" tone="done" />
      <TaskRows tasks={pendingTasks} label="Pendentes" tone="pending" />
      <TaskRows tasks={overdueTasks} label="Atrasadas" tone="overdue" />
      {!doneTasks.length && !pendingTasks.length && !overdueTasks.length && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-muted">Nenhuma tarefa neste ponto.</p>
      )}
    </TooltipShell>
  );
}

export function CategoryTasksTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const category = payload[0].payload;
  const percent = payload[0].percent ? Math.round(payload[0].percent * 100) : 0;
  return (
    <TooltipShell>
      <div className="flex items-start justify-between gap-3">
        <CategoryBadge category={category} />
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600">{percent}%</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-blue-500">{category.total} tarefas nesta categoria</p>
      <TaskRows tasks={category.tasks} label="Lista" tone="neutral" showStatus />
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
                    {memberPoint.total} concluidas - {memberPoint.points} pts
                  </p>
                </div>
              </div>
              <TaskRows tasks={memberPoint.tasks} tone="done" />
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-muted">Nenhum membro pontuou nesta data.</p>
        )}
      </div>
    </TooltipShell>
  );
}

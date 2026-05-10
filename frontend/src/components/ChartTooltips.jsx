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

export const staticChartTooltipProps = {
  allowEscapeViewBox: { x: false, y: false },
  offset: 0,
  position: { y: 8 },
  reverseDirection: { x: true, y: false },
  wrapperStyle: { pointerEvents: "auto", zIndex: 60, outline: "none" }
};

function TooltipShell({ children, scrollable = false }) {
  return (
    <div
      className={`chart-tooltip-shell overflow-hidden rounded-[22px] border border-slate-200 bg-white/95 text-sm text-ink shadow-soft backdrop-blur-xl animate-in ${scrollable ? "p-0" : "p-4"}`}
      onWheel={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

function TaskRows({ tasks = [], label = "Tarefas", tone = "neutral", showStatus = false, limit = 3 }) {
  if (!tasks.length) return null;
  const visibleTasks = limit ? tasks.slice(0, limit) : tasks;
  const hiddenCount = tasks.length - visibleTasks.length;

  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 space-y-2">
        {visibleTasks.map((task) => (
          <div key={task.id} className={`rounded-2xl border px-3 py-2 ${statusTone[tone] || statusTone.neutral}`}>
            <p className="truncate font-semibold text-ink">{task.title}</p>
            <p className="mt-1 text-xs opacity-80">
              {getAssigneeNames(task)} - {getTaskPointLabel(task)}
              {showStatus ? ` - ${statusLabels[task.status] || task.status}` : ""}
            </p>
          </div>
        ))}
        {hiddenCount > 0 && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-muted">+{hiddenCount} tarefa(s) nesta lista</p>}
      </div>
    </div>
  );
}

export function WeeklyTasksTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const doneTasks = point.doneTasks || point.tasks || [];
  const pendingTasks = point.pendingTasks || point.pending_tasks || [];
  const overdueTasks = point.overdueTasks || point.overdue_tasks || [];
  const doneCount = point.done ?? doneTasks.length;
  const pendingCount = point.pending ?? pendingTasks.length;
  const overdueCount = point.overdue ?? overdueTasks.length;
  const totalCount = point.total ?? doneCount + pendingCount + overdueCount;

  return (
    <TooltipShell scrollable>
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 p-4 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-ink">Data: {point.label}</p>
            <p className="mt-1 text-sm font-semibold text-blush">{totalCount} tarefas no radar</p>
          </div>
          <div className="rounded-2xl bg-blush/10 px-3 py-2 text-right text-xs font-bold text-blush shadow-card">
            {doneCount} feitas
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold">
          <span className="rounded-2xl bg-emerald-50 px-2 py-2 text-emerald-700">{doneCount} concluidas</span>
          <span className="rounded-2xl bg-amber-50 px-2 py-2 text-amber-700">{pendingCount} pendentes</span>
          <span className="rounded-2xl bg-rose-50 px-2 py-2 text-rose-700">{overdueCount} atrasadas</span>
        </div>
      </div>
      <div className="chart-tooltip-scroll max-h-[min(52vh,22rem)] overflow-y-auto px-4 pb-4 pt-1">
        <TaskRows tasks={doneTasks} label="Concluidas" tone="done" limit={0} />
        <TaskRows tasks={pendingTasks} label="Pendentes" tone="pending" limit={0} />
        <TaskRows tasks={overdueTasks} label="Atrasadas" tone="overdue" limit={0} />
        {!doneTasks.length && !pendingTasks.length && !overdueTasks.length && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-muted">Nenhuma tarefa neste ponto.</p>
        )}
      </div>
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
      <p className="mt-3 text-sm font-semibold text-blush">{category.total} tarefas nesta categoria</p>
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
      <div className="mt-3 space-y-3">
        {members.length ? (
          members.slice(0, 3).map((memberPoint) => (
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
        {members.length > 3 && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-muted">+{members.length - 3} membro(s) com atividade</p>}
      </div>
    </TooltipShell>
  );
}

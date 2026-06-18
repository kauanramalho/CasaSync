import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CalendarClock, CalendarHeart, CheckCircle2, Clock3, Heart, MessageCircleHeart, Pin, Plus, RefreshCw, Star, Target } from "lucide-react";

import AssigneeStack from "../components/AssigneeStack";
import Avatar from "../components/Avatar";
import { CategoryBadge } from "../components/Badges";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import TaskDeleteConfirmModal from "../components/TaskDeleteConfirmModal";
import TaskDetailsModal from "../components/TaskDetailsModal";
import TaskEditorModal from "../components/TaskEditorModal";
import TaskList from "../components/TaskList";
import WeeklyProductivityChart from "../components/WeeklyProductivityChart";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import useTaskDeletion from "../hooks/useTaskDeletion";
import { categoriesApi, coupleApi, dashboardApi, familiesApi, tasksApi } from "../services/api";
import { APP_RESUMED_EVENT, emitAppDataChanged } from "../utils/events";
import { formatDate, normalizeApiError, toValidDate } from "../utils/formatters";
import { syncTaskToGoogleCalendarSafely } from "../utils/googleCalendarTasks";
import { getHiddenRecentTaskIds, hideRecentTask } from "../utils/recentTasks";
import { applyTaskAttachmentChanges, hasTaskAttachmentChanges } from "../utils/taskAttachments";
import { isTaskOpen, sortTasksForDisplay } from "../utils/tasks";

const statMeta = {
  done: { icon: CheckCircle2, tone: "emerald" },
  pending: { icon: Clock3, tone: "orange" },
  overdue: { icon: AlertCircle, tone: "rose" },
  points: { icon: Star, tone: "violet" }
};

function timestamp(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function formatTime(value) {
  const date = toValidDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function relativeDateLabel(value) {
  if (!value) return "";
  const now = new Date();
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "";

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const days = Math.round((startTarget - startToday) / 86400000);

  if (days < 0) return "Ja passou";
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanha";
  return `Em ${days} dias`;
}

function buildCouplePreviewItems(space = {}) {
  const goals = (space.goals || []).map((goal) => ({
    id: `goal-${goal.id}`,
    type: "goal",
    pinned: Boolean(goal.pinned),
    createdAt: goal.created_at,
    title: goal.title,
    description: goal.description,
    progress: goal.progress || 0,
    targetDate: goal.target_date
  }));

  const dates = (space.date_ideas || []).map((idea) => ({
    id: `date-${idea.id}`,
    type: "date",
    pinned: Boolean(idea.pinned),
    createdAt: idea.created_at,
    title: idea.title,
    description: idea.description,
    date: idea.suggested_date,
    done: idea.is_done
  }));

  const notes = (space.notes || []).map((note) => ({
    id: `note-${note.id}`,
    type: "note",
    pinned: Boolean(note.pinned),
    createdAt: note.created_at,
    message: note.message,
    author: note.created_by?.name,
    color: note.color
  }));

  return [...goals, ...dates, ...notes]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || timestamp(b.createdAt) - timestamp(a.createdAt))
    .slice(0, 3);
}

function CouplePreviewItem({ item }) {
  const pin = item.pinned ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-blush/20 bg-blush/15 px-2 py-0.5 text-[10px] font-bold text-blush shadow-sm">
      <Pin className="h-3 w-3" />
      Fixado
    </span>
  ) : null;

  if (item.type === "goal") {
    const progress = Math.min(100, item.progress || 0);
    return (
      <div className="rounded-[22px] border border-blush/20 bg-gradient-to-br from-surface/95 via-surface-soft/70 to-blush/10 p-3 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-blush/15 text-blush shadow-sm">
              <Target className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-blush">Meta do mes</p>
              <p className="line-clamp-1 font-bold text-ink">{item.title}</p>
            </div>
          </div>
          {pin}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-blush/15">
            <div className="h-full rounded-full bg-gradient-to-r from-peach to-blush" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-bold text-ink">{progress}%</span>
        </div>
        <p className="mt-2 text-xs font-semibold text-muted">{formatDate(item.targetDate, "Sem prazo")}</p>
      </div>
    );
  }

  if (item.type === "date") {
    const badge = relativeDateLabel(item.date);
    return (
      <div className="rounded-[22px] border border-peach/20 bg-gradient-to-br from-surface/95 via-surface-soft/70 to-peach/10 p-3 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-peach/15 text-peach shadow-sm">
              <CalendarHeart className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-blush">Proximo date</p>
              <p className="line-clamp-1 font-bold text-ink">{item.title}</p>
            </div>
          </div>
          {pin}
        </div>
        {item.description && <p className="line-clamp-1 mt-2 text-xs font-semibold text-muted">{item.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-muted">
          <span>{formatDate(item.date, "Sem data")}</span>
          {item.date && <span>{formatTime(item.date)}</span>}
          {badge && <span className="rounded-full bg-blush/15 px-2 py-1 text-blush">{badge}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-lavender/20 bg-gradient-to-br from-surface/95 via-surface-soft/70 to-lavender/10 p-3 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-lavender/15 text-blush shadow-sm">
            <MessageCircleHeart className="h-4 w-4" />
          </span>
          <p className="text-[11px] font-bold text-blush">Recado</p>
        </div>
        {pin}
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-relaxed text-ink">{item.message}</p>
      <p className="mt-2 text-[11px] font-bold text-muted">- {item.author || "CasaSync"}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [dashboard, setDashboard] = useState(null);
  const [categoriesRows, setCategoriesRows] = useState([]);
  const [coupleSpace, setCoupleSpace] = useState({ goals: [], date_ideas: [], notes: [] });
  const [members, setMembers] = useState([]);
  const [hiddenRecentIds, setHiddenRecentIds] = useState(() => getHiddenRecentTaskIds());
  const [detailsTask, setDetailsTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async function load() {
    setLoading(true);
    setError("");
    try {
      const [dashboardRows, categoryRows, memberRows, coupleRows] = await Promise.all([dashboardApi.get(), categoriesApi.list(), familiesApi.members(), coupleApi.get()]);
      setDashboard(dashboardRows);
      setCategoriesRows(categoryRows);
      setMembers(memberRows);
      setCoupleSpace(coupleRows);
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(APP_RESUMED_EVENT, load);
    return () => window.removeEventListener(APP_RESUMED_EVENT, load);
  }, [load]);

  const handleComplete = useCallback(async function handleComplete(task) {
    const updated = await tasksApi.complete(task.id);
    addNotification({
      title: updated.status === "concluida" ? "Tarefa concluída" : "Tarefa reaberta",
      description: updated.status === "concluida" ? `${updated.title} somou pontos no ranking.` : `${updated.title} voltou para pendente e removeu os pontos.`,
      type: updated.status === "concluida" ? "done" : "reopened",
      actor: user?.name
    });
    emitAppDataChanged();
    load();
  }, [addNotification, load, user?.name]);

  const handleSaveEdit = useCallback(async function handleSaveEdit(payload, attachmentChanges = {}) {
    if (!editingTask) return;
    setSavingEdit(true);
    try {
      const updated = await tasksApi.update(editingTask.id, payload);
      await applyTaskAttachmentChanges(updated.id, attachmentChanges);
      const calendarResult = attachmentChanges.syncGoogleCalendar
        ? await syncTaskToGoogleCalendarSafely(updated.id)
        : null;
      if (calendarResult && !calendarResult.ok) {
        setError(calendarResult.message);
      }
      addNotification({
        title: "Tarefa editada",
        description: hasTaskAttachmentChanges(attachmentChanges)
          ? `${updated.title} foi atualizada com anexos.`
          : `${updated.title} foi atualizada nas recentes e nos relatórios.`,
        type: "task",
        actor: user?.name
      });
      setEditingTask(null);
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSavingEdit(false);
    }
  }, [addNotification, editingTask, load, user?.name]);

  const handleRemoveRecent = useCallback(function handleRemoveRecent(task) {
    setHiddenRecentIds(hideRecentTask(task.id));
    addNotification({
      title: "Tarefa ocultada das recentes",
      description: `${task.title} continua salva em tarefas, relatórios e estatísticas.`,
      type: "task",
      actor: user?.name
    });
  }, [addNotification, user?.name]);

  const handleTaskDeleted = useCallback(function handleTaskDeleted(task) {
    setDashboard((current) => current
      ? { ...current, recent_tasks: (current.recent_tasks || []).filter((item) => item.id !== task.id) }
      : current);
    setDetailsTask((current) => (current?.id === task.id ? null : current));
    setEditingTask((current) => (current?.id === task.id ? null : current));
    load();
  }, [load]);

  const {
    pendingDeleteTask,
    deletingTaskId,
    requestTaskDelete,
    cancelTaskDelete,
    confirmTaskDelete
  } = useTaskDeletion({
    onDeleted: handleTaskDeleted,
    onError: setError
  });

  const handleEditFromDetails = useCallback(function handleEditFromDetails(task) {
    setDetailsTask(null);
    setEditingTask(task);
  }, []);

  const stats = useMemo(() => dashboard?.stats ?? [], [dashboard]);
  const productivity = useMemo(() => dashboard?.weekly_productivity ?? [], [dashboard]);
  const categories = useMemo(() => dashboard?.tasks_by_category ?? [], [dashboard]);
  const ranking = useMemo(() => dashboard?.ranking ?? [], [dashboard]);
  const recentTasks = useMemo(() => {
    const hidden = new Set(hiddenRecentIds);
    return sortTasksForDisplay((dashboard?.recent_tasks ?? []).filter((task) => isTaskOpen(task) && !hidden.has(task.id)).slice(0, 6));
  }, [dashboard, hiddenRecentIds]);
  const couplePreviewItems = useMemo(() => buildCouplePreviewItems(coupleSpace), [coupleSpace]);
  const overdueTasks = useMemo(() => dashboard?.overdue_tasks ?? [], [dashboard]);
  const upcomingTasks = useMemo(() => dashboard?.upcoming_tasks ?? [], [dashboard]);
  const weeklyTotals = useMemo(() => productivity.reduce((totals, day) => ({
    done: totals.done + (day.done ?? day.tasks?.length ?? 0),
    pending: totals.pending + (day.pending ?? day.pending_tasks?.length ?? 0),
    overdue: totals.overdue + (day.overdue ?? day.overdue_tasks?.length ?? 0)
  }), { done: 0, pending: 0, overdue: 0 }), [productivity]);

  const greeting = useMemo(() => {
    const firstName = user?.name?.split(" ")[0] || "família";
    return `Olá, ${firstName}!`;
  }, [user]);

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle="Vamos juntos tornar o dia incrível!"
        user={user}
        action={
          <Button as={Link} to="/tarefas/nova" className="shrink-0 px-3 sm:px-4">
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">Nova tarefa</span>
            <span className="sm:hidden">Criar</span>
          </Button>
        }
      />

      {loading && !dashboard ? <DashboardSkeleton /> : error && !dashboard ? (
        <Card className="border-rose-200 bg-rose-50/70 text-center" role="alert">
          <AlertCircle className="mx-auto h-9 w-9 text-rose-500" />
          <h2 className="mt-3 text-lg font-bold text-ink">Não foi possível carregar sua visão geral</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">{error}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={load}><RefreshCw className="h-4 w-4" />Tentar novamente</Button>
            <Button as={Link} to="/familia" variant="secondary">Ver família</Button>
          </div>
        </Card>
      ) : (
        <>
          {error && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
              <p className="text-sm font-semibold text-amber-900">Alguns dados podem estar desatualizados. {error}</p>
              <button type="button" onClick={load} className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-amber-900"><RefreshCw className="h-4 w-4" />Atualizar</button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((item) => {
              const meta = statMeta[item.key] ?? statMeta.pending;
              return <StatCard key={item.key} icon={meta.icon} tone={meta.tone} label={item.label} value={item.value} hint={item.hint} emphasis={item.key === "overdue" && item.value > 0} />;
            })}
          </div>

          <Card className="mt-6 overflow-hidden p-0 sm:p-0">
            <div className="grid xl:grid-cols-2">
              <section className="border-b border-border/70 p-4 sm:p-5 xl:border-b-0 xl:border-r">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-600">Precisa de atenção</p><h2 className="mt-1 text-lg font-bold text-ink">Tarefas atrasadas</h2></div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-500"><AlertCircle className="h-5 w-5" /></span>
                </div>
                <FocusTaskList tasks={overdueTasks} tone="danger" emptyTitle="Tudo em dia por aqui" emptyDescription="Quando uma tarefa passar do prazo, ela aparecerá nesta área." onComplete={handleComplete} onOpenDetails={setDetailsTask} />
                {overdueTasks.length > 0 && <Link to="/tarefas" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-rose-600">Ver todas as tarefas <ArrowRight className="h-4 w-4" /></Link>}
              </section>
              <section className="p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Próximos passos</p><h2 className="mt-1 text-lg font-bold text-ink">Tarefas com prazo</h2></div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-500"><CalendarClock className="h-5 w-5" /></span>
                </div>
                <FocusTaskList tasks={upcomingTasks} tone="upcoming" emptyTitle="Nenhum prazo chegando" emptyDescription="Adicione uma data às tarefas para acompanhar os próximos compromissos." onComplete={handleComplete} onOpenDetails={setDetailsTask} />
                {upcomingTasks.length > 0 && <Link to="/calendario" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-600">Abrir calendário <ArrowRight className="h-4 w-4" /></Link>}
              </section>
            </div>
          </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="section-title">Tarefas recentes</h2><p className="mt-1 text-sm text-muted">Continue de onde a família parou.</p></div>
            <Link to="/tarefas" className="inline-flex items-center gap-2 text-sm font-bold text-blush">Ver todas <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <TaskList
            tasks={recentTasks}
            onComplete={handleComplete}
            onEdit={setEditingTask}
            onRemoveRecent={handleRemoveRecent}
            onDelete={requestTaskDelete}
            onOpenDetails={setDetailsTask}
            compact
            emptyMessage="Nenhuma tarefa pendente. Crie a primeira para organizar a rotina."
          />
        </Card>

        <Card>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="section-title">Produtividade da semana</h2><p className="mt-1 text-sm text-muted">O ritmo da família nos últimos sete dias.</p></div>
            <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{weeklyTotals.done} concluídas</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{weeklyTotals.pending} pendentes</span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">{weeklyTotals.overdue} atrasadas</span>
            </div>
          </div>
          <WeeklyProductivityChart productivity={productivity} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_1.1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Categorias</h2>
            <Link to="/categorias" className="text-sm font-semibold text-muted">
              Ver todas
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.slice(0, 6).map((item) => (
              <div key={item.category} className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm">
                <CategoryBadge category={item} className="max-w-full" />
                <p className="mt-1 text-sm opacity-80">{item.total} tarefas</p>
              </div>
            ))}
            {!categories.length && <p className="empty-state col-span-2">Crie categorias para enxergar melhor a rotina da família.</p>}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Espaço do Casal</h2>
            <Link to="/espaco-do-casal" className="text-sm font-semibold text-muted">
              Ver mais
            </Link>
          </div>
          <div className="rounded-[24px] border border-border/70 bg-gradient-to-br from-surface-soft/80 via-surface/80 to-blush/10 p-3 shadow-card">
            {couplePreviewItems.length ? (
              <div className="grid gap-3">
                {couplePreviewItems.map((item) => (
                  <CouplePreviewItem key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-blush/25 bg-surface/70 px-4 py-6 text-center">
                <Heart className="mx-auto h-8 w-8 text-rose-200" />
                <p className="mt-3 font-semibold text-ink">Nosso cantinho esta esperando novidades.</p>
                <Link to="/espaco-do-casal" className="mt-2 inline-flex text-sm font-bold text-blush">
                  Adicionar recado
                </Link>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="section-title">Resumo por membro</h2><p className="mt-1 text-xs text-muted">Contribuição neste mês</p></div>
            <Link to="/ranking" className="text-sm font-semibold text-muted">
              Ver ranking
            </Link>
          </div>
          <div className="space-y-4">
            {ranking.slice(0, 4).map((item) => (
              <div key={item.user.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/60 bg-surface/70 p-3">
                <Avatar user={item.user} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{item.user.name}</p>
                  <p className="text-xs text-muted">{item.completed_tasks} {item.completed_tasks === 1 ? "tarefa concluída" : "tarefas concluídas"}</p>
                </div>
                <p className="shrink-0 rounded-xl bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700">{item.points} pts</p>
              </div>
            ))}
            {!ranking.length && <p className="empty-state">Convide membros para acompanhar a contribuição da família.</p>}
          </div>
        </Card>
      </div>
        </>
      )}

      <TaskDetailsModal
        task={detailsTask}
        onClose={() => setDetailsTask(null)}
        onEdit={handleEditFromDetails}
      />

      <TaskEditorModal
        task={editingTask}
        categories={categoriesRows}
        members={members}
        saving={savingEdit}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveEdit}
      />

      <TaskDeleteConfirmModal
        task={pendingDeleteTask}
        deleting={Boolean(deletingTaskId)}
        onCancel={cancelTaskDelete}
        onConfirm={confirmTaskDelete}
      />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Carregando visão geral" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="glass-panel h-32 rounded-[24px] bg-surface/70" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="glass-panel h-72 rounded-[28px] bg-surface/70" />
        <div className="glass-panel h-72 rounded-[28px] bg-surface/70" />
      </div>
      <span className="sr-only">Carregando dados do dashboard...</span>
    </div>
  );
}

function FocusTaskList({ tasks, emptyTitle, emptyDescription, tone, onComplete, onOpenDetails }) {
  const emptyIconClasses = tone === "danger" ? "bg-rose-50 text-rose-500" : "bg-blue-50 text-blue-500";

  if (!tasks.length) {
    return (
      <div className="empty-state flex min-h-44 flex-col items-center justify-center">
        <span className={`mb-3 grid h-11 w-11 place-items-center rounded-2xl ${emptyIconClasses}`}>
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <p className="font-bold text-ink">{emptyTitle}</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <article key={task.id} className="rounded-2xl border border-border/70 bg-surface/75 p-3 transition hover:border-blush/30 hover:bg-surface">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={() => onComplete(task)}
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
              aria-label={`Concluir ${task.title}`}
              title="Concluir tarefa"
            >
              <CheckCircle2 className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => onOpenDetails(task)} className="min-w-0 flex-1 text-left">
              <span className="block truncate font-bold text-ink">{task.title}</span>
              <span className={`mt-1 block text-xs font-bold ${tone === "danger" ? "text-rose-600" : "text-blue-600"}`}>
                {formatDate(task.due_date, "Sem prazo")}
              </span>
            </button>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 pl-[52px]">
            {task.category && <CategoryBadge category={task.category} compact className="max-w-full" />}
            <AssigneeStack task={task} />
          </div>
        </article>
      ))}
    </div>
  );
}

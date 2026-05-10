import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarHeart, CheckCircle2, Clock3, Heart, MessageCircleHeart, Pin, Plus, Star, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CategoryBadge } from "../components/Badges";
import Button from "../components/Button";
import Card from "../components/Card";
import { staticChartTooltipProps, WeeklyTasksTooltip } from "../components/ChartTooltips";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import TaskEditorModal from "../components/TaskEditorModal";
import TaskList from "../components/TaskList";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { categoriesApi, coupleApi, dashboardApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { formatDate, normalizeApiError } from "../utils/formatters";
import { getHiddenRecentTaskIds, hideRecentTask } from "../utils/recentTasks";

const statMeta = {
  done: { icon: CheckCircle2, tone: "emerald" },
  pending: { icon: Clock3, tone: "orange" },
  overdue: { icon: AlertCircle, tone: "rose" },
  points: { icon: Star, tone: "violet" }
};

function dateKey(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function timestamp(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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

function buildProductivityView(productivity = [], tasks = []) {
  return productivity.map((point) => {
    const doneTasks = point.tasks?.length ? point.tasks : tasks.filter((task) => task.status === "concluida" && dateKey(task.completed_at) === point.date);
    const dueTasks = tasks.filter((task) => dateKey(task.due_date) === point.date);
    const pendingTasks = dueTasks.filter((task) => ["pendente", "em_andamento"].includes(task.status));
    const overdueTasks = dueTasks.filter((task) => task.status === "atrasada");

    return {
      ...point,
      done: doneTasks.length,
      pending: pendingTasks.length,
      overdue: overdueTasks.length,
      total: doneTasks.length + pendingTasks.length + overdueTasks.length,
      doneTasks,
      pendingTasks,
      overdueTasks
    };
  });
}

export default function Dashboard() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [dashboard, setDashboard] = useState(null);
  const [categoriesRows, setCategoriesRows] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [coupleSpace, setCoupleSpace] = useState({ goals: [], date_ideas: [], notes: [] });
  const [members, setMembers] = useState([]);
  const [hiddenRecentIds, setHiddenRecentIds] = useState(() => getHiddenRecentTaskIds());
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [dashboardRows, categoryRows, memberRows, taskRows, coupleRows] = await Promise.all([dashboardApi.get(), categoriesApi.list(), familiesApi.members(), tasksApi.list(), coupleApi.get()]);
      setDashboard(dashboardRows);
      setCategoriesRows(categoryRows);
      setMembers(memberRows);
      setAllTasks(taskRows);
      setCoupleSpace(coupleRows);
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleComplete(task) {
    const updated = await tasksApi.complete(task.id);
    addNotification({
      title: updated.status === "concluida" ? "Tarefa concluída" : "Tarefa reaberta",
      description: updated.status === "concluida" ? `${updated.title} somou pontos no ranking.` : `${updated.title} voltou para pendente e removeu os pontos.`,
      type: updated.status === "concluida" ? "done" : "reopened",
      actor: user?.name
    });
    emitAppDataChanged();
    load();
  }

  async function handleSaveEdit(payload) {
    if (!editingTask) return;
    setSavingEdit(true);
    try {
      const updated = await tasksApi.update(editingTask.id, payload);
      addNotification({
        title: "Tarefa editada",
        description: `${updated.title} foi atualizada nas recentes e nos relatórios.`,
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
  }

  function handleRemoveRecent(task) {
    setHiddenRecentIds(hideRecentTask(task.id));
    addNotification({
      title: "Tarefa removida das recentes",
      description: `${task.title} continua salva em tarefas, relatórios e estatísticas.`,
      type: "task",
      actor: user?.name
    });
  }

  const stats = useMemo(() => dashboard?.stats ?? [], [dashboard]);
  const productivity = useMemo(() => dashboard?.weekly_productivity ?? [], [dashboard]);
  const categories = useMemo(() => dashboard?.tasks_by_category ?? [], [dashboard]);
  const ranking = useMemo(() => dashboard?.ranking ?? [], [dashboard]);
  const recentTasks = (dashboard?.recent_tasks ?? []).filter((task) => !hiddenRecentIds.includes(task.id)).slice(0, 6);
  const productivityRows = useMemo(() => buildProductivityView(productivity, allTasks), [productivity, allTasks]);
  const couplePreviewItems = useMemo(() => buildCouplePreviewItems(coupleSpace), [coupleSpace]);

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
          <Button as={Link} to="/tarefas/nova" className="hidden lg:inline-flex">
            <Plus className="h-5 w-5" />
            Nova tarefa
          </Button>
        }
      />

      {error && (
        <Card className="mb-6">
          <p className="font-semibold text-ink">{error}</p>
          <Link to="/familia" className="mt-4 inline-flex text-sm font-bold text-blush">
            Criar ou entrar em uma família
          </Link>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {(loading ? ["done", "pending", "overdue", "points"] : stats.map((item) => item.key)).map((key, index) => {
          const item = stats.find((stat) => stat.key === key) ?? { label: "Carregando", value: index === 3 ? 0 : 0, hint: "..." };
          const meta = statMeta[key] ?? statMeta.pending;
          return <StatCard key={key} icon={meta.icon} tone={meta.tone} label={item.label} value={item.value} hint={item.hint} />;
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="section-title">Tarefas recentes</h2>
            <Link to="/tarefas/nova" className="rounded-2xl bg-gradient-to-r from-peach to-blush px-4 py-2 text-sm font-semibold text-white">
              Nova tarefa
            </Link>
          </div>
          <TaskList tasks={recentTasks} onComplete={handleComplete} onEdit={setEditingTask} onRemoveRecent={handleRemoveRecent} compact />
        </Card>

        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="section-title">Produtividade da semana</h2>
            <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Concluidas</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Pendentes</span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">Atrasadas</span>
            </div>
          </div>
          <div className="chart-frame">
            <div className="chart-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productivityRows} margin={{ top: 18, right: 18, left: 2, bottom: 16 }} barCategoryGap="24%" maxBarSize={58}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="4 6" />
                  <XAxis dataKey="label" interval={0} minTickGap={4} height={34} tickMargin={10} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
                  <YAxis width={34} tickMargin={8} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "rgb(var(--color-blush) / 0.08)" }} content={<WeeklyTasksTooltip />} {...staticChartTooltipProps} />
                  <Bar dataKey="done" stackId="week" radius={[0, 0, 10, 10]} fill="var(--chart-3)" animationDuration={750} minPointSize={3} />
                  <Bar dataKey="pending" stackId="week" fill="var(--chart-4)" animationDuration={900} minPointSize={3} />
                  <Bar dataKey="overdue" stackId="week" radius={[12, 12, 0, 0]} fill="var(--chart-5)" animationDuration={1050} minPointSize={3} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
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
            <h2 className="section-title">Ranking do mes</h2>
            <Link to="/ranking" className="text-sm font-semibold text-muted">
              Histórico
            </Link>
          </div>
          <div className="space-y-4">
            {ranking.slice(0, 3).map((item) => (
              <div key={item.user.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-ink">
                    {item.position}. {item.user.name}
                  </p>
                  <div className="mt-2 h-2 w-40 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-blush" style={{ width: `${Math.min(100, item.points / 2)}%` }} />
                  </div>
                </div>
                <p className="font-bold text-ink">{item.points} pts</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <TaskEditorModal
        task={editingTask}
        categories={categoriesRows}
        members={members}
        saving={savingEdit}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveEdit}
      />
    </>
  );
}

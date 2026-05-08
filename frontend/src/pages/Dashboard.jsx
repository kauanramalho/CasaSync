import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, Plus, Star } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import Button from "../components/Button";
import Card from "../components/Card";
import { WeeklyTasksTooltip } from "../components/ChartTooltips";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import TaskEditorModal from "../components/TaskEditorModal";
import TaskList from "../components/TaskList";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { categoriesApi, dashboardApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";
import { getCategoryTone } from "../utils/tasks";
import { getHiddenRecentTaskIds, hideRecentTask } from "../utils/recentTasks";

const statMeta = {
  done: { icon: CheckCircle2, tone: "emerald" },
  pending: { icon: Clock3, tone: "orange" },
  overdue: { icon: AlertCircle, tone: "rose" },
  points: { icon: Star, tone: "violet" }
};

export default function Dashboard() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [dashboard, setDashboard] = useState(null);
  const [categoriesRows, setCategoriesRows] = useState([]);
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
      const [dashboardRows, categoryRows, memberRows] = await Promise.all([dashboardApi.get(), categoriesApi.list(), familiesApi.members()]);
      setDashboard(dashboardRows);
      setCategoriesRows(categoryRows);
      setMembers(memberRows);
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

  const stats = dashboard?.stats ?? [];
  const productivity = dashboard?.weekly_productivity ?? [];
  const categories = dashboard?.tasks_by_category ?? [];
  const ranking = dashboard?.ranking ?? [];
  const recentTasks = (dashboard?.recent_tasks ?? []).filter((task) => !hiddenRecentIds.includes(task.id)).slice(0, 6);

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

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
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
            <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-muted">Esta semana</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productivity}>
                <CartesianGrid vertical={false} stroke="#edf1f7" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#687895", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#687895", fontSize: 12 }} />
                <Tooltip cursor={{ fill: "#fff1f4" }} content={<WeeklyTasksTooltip />} />
                <Bar dataKey="total" radius={[12, 12, 0, 0]} fill="#7aa5ff" />
              </BarChart>
            </ResponsiveContainer>
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
              <div key={item.category} className={`rounded-2xl border p-4 ${getCategoryTone({ name: item.category, color: item.color })}`}>
                <p className="font-semibold">{item.category}</p>
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
          <div className="rounded-[24px] bg-rose-50/80 p-4">
            <p className="text-center font-semibold text-ink">Nosso cantinho especial</p>
            <div className="mt-4 space-y-3 text-sm text-ink">
              <p className="rounded-2xl bg-white/70 px-4 py-3">Próximo date: cinema em casa</p>
              <p className="rounded-2xl bg-white/70 px-4 py-3">Meta do mês: viajar juntos</p>
              <p className="rounded-2xl bg-white/70 px-4 py-3">Mensagem do dia: "Te amo!"</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Ranking da semana</h2>
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


import { useEffect, useMemo, useState } from "react";
import { Download, Flame, TrendingUp } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";

import Avatar from "../components/Avatar";
import { CategoryBadge } from "../components/Badges";
import Button from "../components/Button";
import Card from "../components/Card";
import { CategoryTasksTooltip, staticChartTooltipProps } from "../components/ChartTooltips";
import PageHeader from "../components/PageHeader";
import WeeklyProductivityChart from "../components/WeeklyProductivityChart";
import { useAuth } from "../hooks/useAuth";
import { dashboardApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";
import { getCategoryHex, getCategoryName } from "../utils/tasks";

const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

function getCurrentActivityStreak(productivity = []) {
  let streak = 0;
  for (let index = productivity.length - 1; index >= 0; index -= 1) {
    if ((productivity[index]?.total || 0) <= 0) break;
    streak += 1;
  }
  return streak;
}

export default function Reports() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .get()
      .then(setDashboard)
      .catch((err) => setError(normalizeApiError(err)));
  }, []);

  const categoryData = useMemo(() => dashboard?.tasks_by_category ?? [], [dashboard]);
  const productivity = useMemo(() => dashboard?.weekly_productivity ?? [], [dashboard]);
  const ranking = useMemo(() => dashboard?.ranking ?? [], [dashboard]);
  const stats = useMemo(() => dashboard?.stats ?? [], [dashboard]);
  const doneTasks = stats.find((item) => item.key === "done")?.value ?? 0;
  const pendingTasks = stats.find((item) => item.key === "pending")?.value ?? 0;
  const overdueTasks = stats.find((item) => item.key === "overdue")?.value ?? 0;
  const totalTasks = doneTasks + pendingTasks + overdueTasks;
  const totalCategoryTasks = useMemo(() => categoryData.reduce((sum, item) => sum + item.total, 0), [categoryData]);
  const categoryRows = useMemo(
    () =>
      categoryData.map((item, index) => ({
        ...item,
        name: getCategoryName(item),
        icon: item.icon || item.tasks?.[0]?.category?.icon,
        colorHex: getCategoryHex(item, chartColors[index % chartColors.length]),
        percent: totalCategoryTasks ? Math.round((item.total / totalCategoryTasks) * 100) : 0
      })),
    [categoryData, totalCategoryTasks]
  );
  const topCategory = categoryRows[0];
  const totalPoints = useMemo(() => ranking.reduce((sum, item) => sum + item.points, 0), [ranking]);
  const completionRate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activityStreak = useMemo(() => getCurrentActivityStreak(productivity), [productivity]);
  const weeklyTrend = useMemo(() => {
    const firstHalf = productivity.slice(0, 3).reduce((sum, item) => sum + item.total, 0);
    const secondHalf = productivity.slice(3).reduce((sum, item) => sum + item.total, 0);
    if (!firstHalf && !secondHalf) return 0;
    if (!firstHalf) return 100;
    return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
  }, [productivity]);
  const streakHint = completionRate >= 50 ? "Vocês estão mantendo a constância juntos." : "Continue assim para aumentar a sequência.";
  const weeklyHint = weeklyTrend > 0 ? "Mais tarefas concluídas que no início da semana." : weeklyTrend < 0 ? "Ritmo menor que no início da semana." : "Ritmo estável nesta semana.";

  return (
    <>
      <PageHeader
        title="Relatórios / Estatísticas"
        subtitle="Acompanhe o desempenho do casal e celebre cada conquista juntos."
        user={user}
        action={
          <Button variant="secondary">
            <Download className="h-5 w-5" />
            Exportar relatório
          </Button>
        }
      />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.35fr_0.85fr]">
        <Card className="overflow-visible">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="section-title">Tarefas por categoria</h2>
              <p className="mt-1 text-sm text-muted">Distribuição das responsabilidades da casa.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">{totalCategoryTasks} tarefas</span>
          </div>

          {categoryRows.length ? (
            <>
              <div className="relative mx-auto mt-4 h-56 w-full max-w-[300px] overflow-visible">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Pie data={categoryRows} dataKey="total" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={4} cornerRadius={8} animationDuration={850}>
                      {categoryRows.map((item) => (
                        <Cell key={item.name} fill={item.colorHex} stroke="rgb(var(--color-surface))" strokeWidth={4} />
                      ))}
                    </Pie>
                    <Tooltip content={<CategoryTasksTooltip />} {...staticChartTooltipProps} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-ink">{totalCategoryTasks}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">total</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {categoryRows.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white/75 px-3 py-2 shadow-sm">
                    <CategoryBadge category={item} className="max-w-[70%]" />
                    <div className="text-right text-xs font-bold text-muted">
                      <p className="text-ink">{item.total}</p>
                      <p>{item.percent}%</p>
                    </div>
                  </div>
                ))}
              </div>
              {topCategory && <p className="mt-3 text-xs font-semibold text-muted">Maior volume em {topCategory.name}, com {topCategory.total} tarefas.</p>}
            </>
          ) : (
            <div className="empty-state mt-5">Crie tarefas com categoria para ver a distribuição aqui.</div>
          )}
        </Card>

        <Card className="overflow-visible">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="section-title">Produtividade da semana</h2>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Concluidas</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Pendentes</span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">Atrasadas</span>
            </div>
          </div>
          <WeeklyProductivityChart productivity={productivity} compact />
        </Card>

        <Card>
          <h2 className="section-title">Média de conclusão</h2>
          <p className="mt-8 text-5xl font-bold text-ink">{completionRate}%</p>
          <p className="mt-3 text-sm font-semibold text-emerald-600">
            {doneTasks} de {totalTasks} tarefas foram concluídas.
          </p>
          <p className="mt-1 text-xs font-semibold text-muted">Atualizada conforme os status das tarefas.</p>
          <div className="mt-8 h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full bg-gradient-to-r from-emerald-400 to-blue-400" style={{ width: `${completionRate}%` }} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="section-title">Ranking do mes</h2>
          <div className="mt-5 space-y-4">
            {ranking.map((item) => (
              <div key={item.user.id} className="flex items-center justify-between gap-4 rounded-[24px] bg-white/75 p-4">
                <div className="flex items-center gap-4">
                  <Avatar user={item.user} />
                  <div>
                    <p className="font-bold text-ink">{item.user.name}</p>
                    <p className="text-sm text-muted">{item.completed_tasks} concluídas</p>
                  </div>
                </div>
                <p className="font-bold text-ink">{item.points} pts</p>
              </div>
            ))}
            <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-600">Total do casal: {totalPoints} pontos</p>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card>
            <Flame className="h-8 w-8 text-orange-500" />
            <p className="mt-4 text-3xl font-bold text-ink">{activityStreak} {activityStreak === 1 ? "dia" : "dias"}</p>
            <p className="mt-2 text-sm text-muted">Sequência de organização</p>
            <p className="mt-3 text-xs font-semibold text-orange-500">{streakHint}</p>
          </Card>
          <Card>
            <TrendingUp className="h-8 w-8 text-blue-500" />
            <p className="mt-4 text-3xl font-bold text-ink">{weeklyTrend > 0 ? "+" : ""}{weeklyTrend}%</p>
            <p className="mt-2 text-sm text-muted">Ritmo semanal</p>
            <p className="mt-3 text-xs font-semibold text-blue-500">{weeklyHint}</p>
          </Card>
        </div>
      </div>

    </>
  );
}

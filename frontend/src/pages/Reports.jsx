import { useEffect, useMemo, useState } from "react";
import { Download, Flame, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import Avatar from "../components/Avatar";
import Button from "../components/Button";
import Card from "../components/Card";
import { CategoryTasksTooltip, MemberProductivityTooltip, WeeklyTasksTooltip } from "../components/ChartTooltips";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { dashboardApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";
import { buildProductivityRows, memberChartColors } from "../utils/tasks";

const chartColors = ["#7aa5ff", "#f85d8f", "#63c982", "#ffc77d", "#9d7cf4", "#61c9d6"];

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

  const categoryData = dashboard?.tasks_by_category ?? [];
  const productivity = dashboard?.weekly_productivity ?? [];
  const productivityRows = useMemo(() => buildProductivityRows(productivity), [productivity]);
  const ranking = dashboard?.ranking ?? [];
  const stats = dashboard?.stats ?? [];
  const totalPoints = useMemo(() => ranking.reduce((sum, item) => sum + item.points, 0), [ranking]);
  const completionRate = useMemo(() => {
    const done = stats.find((item) => item.key === "done")?.value ?? 0;
    const pending = stats.find((item) => item.key === "pending")?.value ?? 0;
    const overdue = stats.find((item) => item.key === "overdue")?.value ?? 0;
    const total = done + pending + overdue;
    return total ? Math.round((done / total) * 100) : 0;
  }, [stats]);

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

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <h2 className="section-title">Tarefas por categoria</h2>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="total" nameKey="category" innerRadius={62} outerRadius={92} paddingAngle={3}>
                  {categoryData.map((_, index) => (
                    <Cell key={index} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTasksTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Produtividade semanal</h2>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={productivityRows}>
                <CartesianGrid vertical={false} stroke="#edf1f7" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#687895", fontSize: 12 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#687895", fontSize: 12 }} />
                <Tooltip content={<MemberProductivityTooltip />} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" />
                {ranking.map((item, index) => (
                  <Line
                    key={item.user.id}
                    type="monotone"
                    dataKey={`member_${item.user.id}`}
                    name={item.user.name}
                    stroke={memberChartColors[index % memberChartColors.length]}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Média de conclusão</h2>
          <p className="mt-8 text-5xl font-bold text-ink">{completionRate}%</p>
          <p className="mt-3 text-sm font-semibold text-emerald-600">Atualizada pelos status das tarefas</p>
          <div className="mt-8 h-3 rounded-full bg-slate-100">
            <div className="h-3 rounded-full bg-gradient-to-r from-emerald-400 to-blue-400" style={{ width: `${completionRate}%` }} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="section-title">Ranking geral</h2>
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
            <p className="mt-4 text-3xl font-bold text-ink">12 dias</p>
            <p className="mt-2 text-sm text-muted">Sequência de organização</p>
          </Card>
          <Card>
            <TrendingUp className="h-8 w-8 text-blue-500" />
            <p className="mt-4 text-3xl font-bold text-ink">+15%</p>
            <p className="mt-2 text-sm text-muted">Ritmo semanal</p>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <h2 className="section-title">Desempenho por dia da semana</h2>
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={productivity}>
              <CartesianGrid vertical={false} stroke="#edf1f7" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#687895", fontSize: 12 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#687895", fontSize: 12 }} />
              <Tooltip cursor={{ fill: "#fff1f4" }} content={<WeeklyTasksTooltip />} />
              <Bar dataKey="total" fill="#7aa5ff" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}


import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { staticChartTooltipProps, WeeklyTasksTooltip } from "./ChartTooltips";

export function buildWeeklyProductivityRows(productivity = []) {
  return productivity.map((point) => {
    const doneTasks = point.tasks || [];
    const pendingTasks = point.pending_tasks || [];
    const overdueTasks = point.overdue_tasks || [];

    return {
      ...point,
      done: point.done ?? doneTasks.length,
      pending: point.pending ?? pendingTasks.length,
      overdue: point.overdue ?? overdueTasks.length,
      total: point.total ?? doneTasks.length + pendingTasks.length + overdueTasks.length,
      doneTasks,
      pendingTasks,
      overdueTasks
    };
  });
}

export default function WeeklyProductivityChart({ productivity = [], compact = false, className = "" }) {
  const rows = useMemo(() => buildWeeklyProductivityRows(productivity), [productivity]);

  return (
    <div className={`chart-frame ${className}`.trim()}>
      <div className={compact ? "chart-canvas-sm" : "chart-canvas"}>
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 18, right: 18, left: 2, bottom: 16 }} barCategoryGap="24%" maxBarSize={58}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="4 6" />
              <XAxis dataKey="label" interval={0} minTickGap={4} height={34} tickMargin={10} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
              <YAxis width={34} tickMargin={8} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
              <Tooltip cursor={{ fill: "rgb(var(--color-blush) / 0.08)" }} content={<WeeklyTasksTooltip />} {...staticChartTooltipProps} />
              <Bar dataKey="done" stackId="week" radius={[0, 0, 10, 10]} fill="var(--chart-3)" animationDuration={750} minPointSize={3} />
              <Bar dataKey="pending" stackId="week" fill="var(--chart-4)" animationDuration={900} minPointSize={3} />
              <Bar dataKey="overdue" stackId="week" radius={[12, 12, 0, 0]} fill="var(--chart-5)" animationDuration={1050} minPointSize={3} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center px-4 text-center">
            <p className="empty-state w-full">Sem dados de produtividade para exibir.</p>
          </div>
        )}
      </div>
    </div>
  );
}

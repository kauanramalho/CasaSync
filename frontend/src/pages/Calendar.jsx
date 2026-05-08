import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { CategoryBadge } from "../components/Badges";
import { useAuth } from "../hooks/useAuth";
import { tasksApi } from "../services/api";
import { formatDate, normalizeApiError } from "../utils/formatters";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function monthDays(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export default function Calendar() {
  const { user } = useAuth();
  const [baseDate, setBaseDate] = useState(new Date());
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    tasksApi
      .list()
      .then(setTasks)
      .catch((err) => setError(normalizeApiError(err)));
  }, []);

  const days = useMemo(() => monthDays(baseDate), [baseDate]);
  const tasksByDay = useMemo(() => {
    return tasks.reduce((acc, task) => {
      if (!task.due_date) return acc;
      const key = task.due_date.slice(0, 10);
      acc[key] = [...(acc[key] || []), task];
      return acc;
    }, {});
  }, [tasks]);

  const upcoming = tasks
    .filter((task) => task.due_date && task.status !== "concluida")
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  function moveMonth(amount) {
    setBaseDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(baseDate);

  return (
    <>
      <PageHeader
        title="Calendário"
        user={user}
        action={
          <Button>
            <CalendarPlus className="h-5 w-5" />
            Novo evento
          </Button>
        }
      />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => moveMonth(-1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-muted shadow-card">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-52 text-xl font-bold capitalize text-ink">{monthLabel}</h2>
          <button onClick={() => moveMonth(1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-muted shadow-card">
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button variant="secondary" onClick={() => setBaseDate(new Date())}>
            Hoje
          </Button>
        </div>
        <div className="inline-flex rounded-2xl bg-white p-1 shadow-card">
          {["Mês", "Semana", "Lista"].map((item, index) => (
            <button key={item} className={`rounded-xl px-5 py-2 text-sm font-semibold ${index === 0 ? "bg-rose-50 text-blush" : "text-muted"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-slate-100">
            {weekdays.map((day) => (
              <div key={day} className="px-3 py-4 text-center text-sm font-semibold text-muted">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dateKey(day);
              const isCurrentMonth = day.getMonth() === baseDate.getMonth();
              const isToday = key === dateKey(new Date());
              return (
                <div key={key} className="min-h-[118px] border-b border-r border-slate-100 p-3">
                  <div className={`mb-3 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${isToday ? "bg-blush text-white" : isCurrentMonth ? "text-ink" : "text-slate-300"}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-2">
                    {(tasksByDay[key] || []).slice(0, 2).map((task) => (
                      <div key={task.id} className="truncate rounded-xl bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        {task.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Próximos compromissos</h2>
          <div className="mt-5 space-y-4">
            {upcoming.map((task) => (
              <div key={task.id} className="border-b border-slate-100 pb-4 last:border-0">
                <p className="text-xs font-bold text-muted">{formatDate(task.due_date)}</p>
                <p className="mt-2 font-semibold text-ink">{task.title}</p>
                <div className="mt-2">
                  <CategoryBadge category={task.category} />
                </div>
              </div>
            ))}
            {!upcoming.length && <p className="rounded-2xl bg-white/75 px-4 py-6 text-center text-sm text-muted">Nenhum compromisso pendente.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}


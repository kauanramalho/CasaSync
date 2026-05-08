import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, CheckCircle2, Clock3, Loader2, Search, Tag, UserRound } from "lucide-react";

import { tasksApi } from "../services/api";
import { formatDate, priorityLabels, statusLabels } from "../utils/formatters";
import { getAssigneeNames, getTaskPointLabel } from "../utils/tasks";

const statusToTab = {
  concluida: "concluida",
  atrasada: "atrasada",
  pendente: "pendente",
  em_andamento: "pendente"
};

function searchableText(task) {
  return [
    task.title,
    task.description,
    task.category?.name,
    task.priority,
    priorityLabels[task.priority],
    task.status,
    statusLabels[task.status],
    task.due_date,
    getTaskPointLabel(task),
    getAssigneeNames(task, ""),
    ...(task.assignees || []).flatMap((person) => [person.name, person.email, person.username])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const ref = useRef(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function handleClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open || loaded || loading) return;
    let alive = true;
    setLoading(true);
    tasksApi
      .list()
      .then((rows) => {
        if (alive) {
          setTasks(rows);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setTasks([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, loaded, loading]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    if (!needle) return tasks.slice(0, 5);
    return tasks.filter((task) => searchableText(task).includes(needle)).slice(0, 7);
  }, [debouncedQuery, tasks]);

  function goToTasks(task) {
    const params = new URLSearchParams();
    params.set("search", task?.title || query.trim());
    if (task?.status) params.set("status", statusToTab[task.status] || "all");
    navigate(`/tarefas?${params.toString()}`);
    setOpen(false);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (query.trim()) goToTasks(null);
  }

  return (
    <div ref={ref} className="relative min-w-[260px] flex-1 lg:w-96 lg:flex-none">
      <form onSubmit={handleSubmit}>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          className="soft-input h-12 pl-12 pr-16 shadow-card"
          placeholder="Buscar tarefas..."
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-xl bg-rose-50 px-2 py-1 text-[11px] font-bold text-blush sm:block">
          Enter
        </span>
      </form>

      {open && (
        <div className="absolute right-0 top-14 z-50 w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-white/80 bg-white/95 shadow-soft backdrop-blur-xl animate-in">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-ink">Pesquisa global</p>
            <p className="mt-0.5 text-xs font-medium text-muted">Nome, categoria, responsavel, prioridade, status, prazo e pontos.</p>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl bg-rose-50/70 px-4 py-4 text-sm font-semibold text-blush">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando tarefas...
              </div>
            ) : results.length ? (
              results.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => goToTasks(task)}
                  className="group w-full rounded-2xl px-3 py-3 text-left transition hover:bg-rose-50/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink group-hover:text-blush">{task.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-muted">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-600">
                          <Tag className="h-3 w-3" />
                          {task.category?.name || "Sem categoria"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-violet-600">
                          <UserRound className="h-3 w-3" />
                          {getAssigneeNames(task)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {getTaskPointLabel(task)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs font-bold text-muted">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-card">
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(task.due_date)}
                      </span>
                      <p className="mt-2 text-blush">{statusLabels[task.status] || task.status}</p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <Clock3 className="mx-auto h-8 w-8 text-rose-200" />
                <p className="mt-3 font-bold text-ink">Nada encontrado.</p>
                <p className="mt-1 text-sm text-muted">Tente buscar por pessoa, categoria, status ou parte do titulo.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

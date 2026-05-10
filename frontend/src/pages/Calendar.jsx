import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Edit3, Plus, X } from "lucide-react";

import AssigneeStack from "../components/AssigneeStack";
import { CategoryBadge, CategoryGlyph, PriorityBadge, StatusBadge } from "../components/Badges";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import TaskEditorModal from "../components/TaskEditorModal";
import { useAppPreferences } from "../hooks/useAppPreferences";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { categoriesApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { formatDate, normalizeApiError } from "../utils/formatters";
import { buildMonthDays, getStoredPreferences, getWeekdayLabels, startOfWeek as getPreferenceStartOfWeek } from "../utils/preferences";
import { getCategoryHex, getTaskPointLabel } from "../utils/tasks";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const viewModes = [
  { key: "month", label: "Mês" },
  { key: "week", label: "Semana" },
  { key: "list", label: "Lista" }
];
const priorityWeight = { alta: 3, media: 2, baixa: 1 };
const priorityDot = {
  alta: "bg-rose-400",
  media: "bg-orange-400",
  baixa: "bg-emerald-400"
};

function weekDays(baseDate, weekStart) {
  const start = getPreferenceStartOfWeek(baseDate, weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function taskDateKey(task) {
  return task?.due_date ? dateKey(task.due_date) : "";
}

function timeLabel(value) {
  if (!value) return "Sem horário";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: getStoredPreferences().timezone
  }).format(new Date(value));
}

function fullDateLabel(date) {
  const timezone = getStoredPreferences().timezone;
  const datePart = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: timezone }).format(date);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: timezone }).format(date);
  return `${datePart}, ${weekday}`;
}

function periodLabel(baseDate, viewMode, weekStart) {
  if (viewMode === "week") {
    const days = weekDays(baseDate, weekStart);
    return `${formatDate(days[0])} a ${formatDate(days[6])}`;
  }
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(baseDate);
}

function sortCalendarTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    const priorityDelta = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    if (priorityDelta) return priorityDelta;
    const aDate = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    const bDate = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDate !== bDate) return aDate - bDate;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function CalendarTaskPill({ task, onPreview, onPreviewLeave, onOpen, compact = false }) {
  const color = getCategoryHex(task.category, "#7aa5ff");

  return (
    <button
      type="button"
      tabIndex={0}
      onMouseEnter={(event) => onPreview?.(task, event)}
      onMouseLeave={onPreviewLeave}
      onFocus={(event) => onPreview?.(task, event)}
      onBlur={onPreviewLeave}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.(task, event);
      }}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded-xl border px-2 py-1 text-left text-xs font-bold transition hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 ${
        compact ? "min-h-[28px]" : "min-h-[32px]"
      }`}
      style={{ backgroundColor: `${color}14`, borderColor: `${color}2e`, color }}
      aria-label={`Ver detalhes de ${task.title}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[task.priority] || priorityDot.media}`} />
      {!compact && <CategoryGlyph category={task.category} className="h-5 w-5 bg-white/80" iconClassName="h-3 w-3" />}
      <span className="truncate">{task.title}</span>
    </button>
  );
}

function TaskPreview({ preview, onMouseEnter, onMouseLeave }) {
  if (!preview || typeof document === "undefined") return null;

  const width = Math.min(360, window.innerWidth - 32);
  const roomBelow = window.innerHeight - preview.rect.bottom;
  const top = roomBelow > 280 ? preview.rect.bottom + 10 : Math.max(16, preview.rect.top - 280);
  const left = clamp(preview.rect.left + preview.rect.width / 2 - width / 2, 16, window.innerWidth - width - 16);
  const task = preview.task;

  return createPortal(
    <div
      className="fixed z-[120] w-[min(360px,calc(100vw-2rem))] rounded-[24px] border border-white/80 bg-white/95 p-4 text-sm text-ink shadow-soft backdrop-blur-xl animate-in"
      style={{ top, left, width }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="tooltip"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{task.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Clock3 className="h-3.5 w-3.5" />
            {timeLabel(task.due_date)}
          </p>
        </div>
        <PriorityBadge priority={task.priority} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <CategoryBadge category={task.category} />
        <StatusBadge status={task.status} />
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50/80 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Responsáveis</p>
        <AssigneeStack task={task} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-muted">
        <span className="rounded-2xl bg-blue-50 px-3 py-2 text-blue-700">Prazo: {formatDate(task.due_date)}</span>
        <span className="rounded-2xl bg-rose-50 px-3 py-2 text-blush">{getTaskPointLabel(task)}</span>
      </div>
      {task.description && <p className="mt-3 max-h-16 overflow-hidden rounded-2xl bg-white px-3 py-2 text-xs font-medium text-muted">{task.description}</p>}
    </div>,
    document.body
  );
}

function DayPanel({ date, tasks, onClose, onComplete, onCompleteAll, onEdit }) {
  const orderedTasks = sortCalendarTasks(tasks);
  const openTasks = orderedTasks.filter((task) => task.status !== "concluida");

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex justify-end bg-slate-900/25 p-0 backdrop-blur-sm md:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-soft animate-in md:max-w-xl md:rounded-[30px]">
        <div className="border-b border-slate-100 px-5 py-5 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-blush">
                <CalendarDays className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-ink">{fullDateLabel(date)}</h2>
              <p className="mt-1 text-sm font-semibold text-muted">
                {orderedTasks.length} {orderedTasks.length === 1 ? "tarefa" : "tarefas"}
              </p>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {orderedTasks.length > 0 && (
              <Button variant="secondary" onClick={() => onEdit?.(orderedTasks[0])}>
                <Edit3 className="h-4 w-4" />
                Editar
              </Button>
            )}
            <Button variant="secondary" onClick={() => onCompleteAll?.(openTasks)} disabled={!openTasks.length}>
              <Check className="h-4 w-4" />
              Concluir todas
            </Button>
            <Button as={Link} to="/tarefas/nova">
              <Plus className="h-4 w-4" />
              Nova tarefa
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6">
          <div className="space-y-3">
            {orderedTasks.map((task) => (
              <div key={task.id} className="grid grid-cols-[32px_52px_1fr] gap-3 rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-sm">
                <button
                  type="button"
                  onClick={() => onComplete?.(task)}
                  className={`mt-1 grid h-6 w-6 place-items-center rounded-full border transition ${
                    task.status === "concluida" ? "border-emerald-400 bg-emerald-400 text-white" : "border-slate-300 text-transparent hover:border-emerald-300"
                  }`}
                  title={task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
                >
                  <Check className="h-4 w-4" />
                </button>
                <span className="pt-1 text-xs font-bold text-muted">{timeLabel(task.due_date)}</span>
                <div className="min-w-0">
                  <button type="button" onClick={() => onEdit?.(task)} className="block max-w-full truncate text-left font-bold text-ink hover:text-blush">
                    {task.title}
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CategoryBadge category={task.category} compact />
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                  <AssigneeStack task={task} className="mt-3" />
                </div>
              </div>
            ))}
            {!orderedTasks.length && <div className="empty-state">Nenhuma tarefa neste dia.</div>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Calendar() {
  const { user } = useAuth();
  const { preferences } = useAppPreferences();
  const { addNotification } = useNotifications();
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month");
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [preview, setPreview] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");
  const previewTimer = useRef(null);

  const load = useCallback(async function load() {
    setError("");
    try {
      const [taskRows, categoryRows, memberRows] = await Promise.all([tasksApi.list(), categoriesApi.list(), familiesApi.members()]);
      setTasks(taskRows);
      setCategories(categoryRows);
      setMembers(memberRows);
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }, []);

  useEffect(() => {
    load();
    return () => window.clearTimeout(previewTimer.current);
  }, [load]);

  const weekdayLabels = useMemo(() => getWeekdayLabels(preferences.weekStart) || weekdays, [preferences.weekStart]);
  const days = useMemo(() => buildMonthDays(baseDate, preferences.weekStart), [baseDate, preferences.weekStart]);
  const week = useMemo(() => weekDays(baseDate, preferences.weekStart), [baseDate, preferences.weekStart]);
  const tasksByDay = useMemo(() => {
    const buckets = tasks.reduce((acc, task) => {
      const key = taskDateKey(task);
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});
    Object.keys(buckets).forEach((key) => {
      buckets[key] = sortCalendarTasks(buckets[key]);
    });
    return buckets;
  }, [tasks]);

  const upcoming = useMemo(
    () =>
      tasks
        .filter((task) => task.due_date && task.status !== "concluida")
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 6),
    [tasks]
  );

  const periodTasks = useMemo(() => {
    const month = baseDate.getMonth();
    const year = baseDate.getFullYear();
    return sortCalendarTasks(tasks.filter((task) => {
      if (!task.due_date) return false;
      const date = new Date(task.due_date);
      return date.getMonth() === month && date.getFullYear() === year;
    }));
  }, [baseDate, tasks]);

  const listGroups = useMemo(() => {
    return periodTasks.reduce((acc, task) => {
      const key = taskDateKey(task);
      acc[key] = [...(acc[key] || []), task];
      return acc;
    }, {});
  }, [periodTasks]);

  const selectedTasks = selectedDate ? tasksByDay[dateKey(selectedDate)] || [] : [];

  const movePeriod = useCallback(function movePeriod(amount) {
    setBaseDate((current) => {
      if (viewMode === "week") {
        const next = new Date(current);
        next.setDate(current.getDate() + amount * 7);
        return next;
      }
      return new Date(current.getFullYear(), current.getMonth() + amount, 1);
    });
  }, [viewMode]);

  const openDay = useCallback(function openDay(day) {
    setSelectedDate(new Date(day));
  }, []);

  const showPreview = useCallback(function showPreview(task, event) {
    window.clearTimeout(previewTimer.current);
    setPreview({ task, rect: event.currentTarget.getBoundingClientRect() });
  }, []);

  const schedulePreviewClose = useCallback(function schedulePreviewClose() {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreview(null), 120);
  }, []);

  const openTaskPreview = useCallback(function openTaskPreview(task, event) {
    showPreview(task, event);
  }, [showPreview]);

  const handleComplete = useCallback(async function handleComplete(task) {
    const updated = await tasksApi.complete(task.id);
    setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    addNotification({
      title: updated.status === "concluida" ? "Tarefa concluída" : "Tarefa reaberta",
      description: updated.status === "concluida" ? `${updated.title} somou pontos no calendário.` : `${updated.title} voltou para pendente.`,
      type: updated.status === "concluida" ? "done" : "reopened",
      actor: user?.name
    });
    emitAppDataChanged();
  }, [addNotification, user?.name]);

  const handleCompleteAll = useCallback(async function handleCompleteAll(dayTasks) {
    const openTasks = dayTasks.filter((task) => task.status !== "concluida");
    if (!openTasks.length) return;
    const updatedTasks = await Promise.all(openTasks.map((task) => tasksApi.complete(task.id)));
    const updatedById = new Map(updatedTasks.map((task) => [task.id, task]));
    setTasks((current) => current.map((task) => updatedById.get(task.id) || task));
    addNotification({
      title: "Tarefas do dia concluídas",
      description: `${openTasks.length} tarefas foram marcadas como concluídas.`,
      type: "done",
      actor: user?.name
    });
    emitAppDataChanged();
  }, [addNotification, user?.name]);

  const handleSaveEdit = useCallback(async function handleSaveEdit(payload) {
    if (!editingTask) return;
    setSavingEdit(true);
    try {
      const updated = await tasksApi.update(editingTask.id, payload);
      addNotification({
        title: "Tarefa editada",
        description: `${updated.title} foi atualizada no calendário.`,
        type: "task",
        actor: user?.name
      });
      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      setEditingTask(null);
      emitAppDataChanged();
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSavingEdit(false);
    }
  }, [addNotification, editingTask, user?.name]);

  function renderMonthView() {
    return (
      <Card className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="calendar-weekday-row grid grid-cols-7">
              {weekdayLabels.map((day) => (
                <div key={day} className="px-3 py-4 text-center text-sm font-semibold text-muted">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = dateKey(day);
                const dayTasks = tasksByDay[key] || [];
                const visibleTasks = dayTasks.slice(0, 3);
                const hiddenCount = Math.max(0, dayTasks.length - visibleTasks.length);
                const isCurrentMonth = day.getMonth() === baseDate.getMonth();
                const isToday = key === dateKey(new Date());
                const isSelected = selectedDate && key === dateKey(selectedDate);

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDay(day)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") openDay(day);
                    }}
                    className={clsx(
                      "calendar-day-cell min-h-[132px] cursor-pointer border-b border-r p-3 transition",
                      isCurrentMonth ? "calendar-day-current" : "calendar-day-outside",
                      isSelected && "calendar-day-selected"
                    )}
                  >
                    <div
                      className={clsx(
                        "mb-3 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold",
                        isToday ? "bg-blush text-white shadow-card" : isCurrentMonth ? "text-ink" : "calendar-day-number-outside"
                      )}
                    >
                      {day.getDate()}
                    </div>
                    <div className="space-y-1.5">
                      {visibleTasks.map((task) => (
                        <CalendarTaskPill key={task.id} task={task} compact onPreview={showPreview} onPreviewLeave={schedulePreviewClose} onOpen={openTaskPreview} />
                      ))}
                      {hiddenCount > 0 && (
                        <button type="button" onClick={(event) => { event.stopPropagation(); openDay(day); }} className="text-xs font-bold text-blush hover:underline">
                          +{hiddenCount} {hiddenCount === 1 ? "tarefa" : "tarefas"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  function renderWeekView() {
    return (
      <Card className="p-0">
        <div className="overflow-x-auto">
          <div className="grid min-w-[860px] grid-cols-7 divide-x divide-slate-100">
            {week.map((day, index) => {
              const key = dateKey(day);
              const dayTasks = tasksByDay[key] || [];
              return (
                <div key={key} className="min-h-[520px] p-4">
                  <button type="button" onClick={() => openDay(day)} className="mb-4 w-full rounded-2xl bg-slate-50 px-3 py-3 text-left hover:bg-rose-50">
                    <p className="text-xs font-bold uppercase text-muted">{weekdayLabels[index]}</p>
                    <p className="mt-1 text-xl font-bold text-ink">{day.getDate()}</p>
                    <p className="text-xs font-semibold text-muted">{dayTasks.length} tarefas</p>
                  </button>
                  <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                    {dayTasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-sm">
                        <CalendarTaskPill task={task} onPreview={showPreview} onPreviewLeave={schedulePreviewClose} onOpen={openTaskPreview} />
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                          <span>{timeLabel(task.due_date)}</span>
                          <PriorityBadge priority={task.priority} />
                        </div>
                        <div className="mt-2">
                          <CategoryBadge category={task.category} compact />
                        </div>
                        <AssigneeStack task={task} className="mt-3" showName={false} />
                      </div>
                    ))}
                    {!dayTasks.length && <p className="rounded-2xl bg-white/75 px-3 py-6 text-center text-sm font-semibold text-muted">Livre por aqui.</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  }

  function renderListView() {
    const keys = Object.keys(listGroups).sort();
    return (
      <Card>
        <div className="max-h-[680px] overflow-y-auto pr-1">
          <div className="space-y-5">
            {keys.map((key) => (
              <div key={key}>
                <button type="button" onClick={() => openDay(new Date(`${key}T12:00:00`))} className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left hover:bg-rose-50">
                  <div>
                    <p className="font-bold text-ink">{fullDateLabel(new Date(`${key}T12:00:00`))}</p>
                    <p className="text-xs font-semibold text-muted">{listGroups[key].length} tarefas</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </button>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white/70">
                  {listGroups[key].map((task) => (
                    <div key={task.id} className="grid gap-3 px-4 py-3 md:grid-cols-[64px_1fr_180px_120px] md:items-center">
                      <span className="text-sm font-bold text-muted">{timeLabel(task.due_date)}</span>
                      <div className="min-w-0">
                        <button type="button" onClick={() => setEditingTask(task)} className="truncate text-left font-bold text-ink hover:text-blush">
                          {task.title}
                        </button>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <CategoryBadge category={task.category} compact />
                          <StatusBadge status={task.status} />
                        </div>
                      </div>
                      <AssigneeStack task={task} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!keys.length && <div className="empty-state">Nenhuma tarefa com prazo neste período.</div>}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Calendário" user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => movePeriod(-1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-muted shadow-card">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-52 text-xl font-bold capitalize text-ink">{periodLabel(baseDate, viewMode, preferences.weekStart)}</h2>
          <button onClick={() => movePeriod(1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-muted shadow-card">
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button variant="secondary" onClick={() => setBaseDate(new Date())}>
            Hoje
          </Button>
        </div>
        <div className="inline-flex self-start rounded-2xl bg-white p-1 shadow-card xl:self-auto">
          {viewModes.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setViewMode(item.key)}
              className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${viewMode === item.key ? "bg-rose-50 text-blush shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {viewMode === "month" && renderMonthView()}
          {viewMode === "week" && renderWeekView()}
          {viewMode === "list" && renderListView()}
        </div>

        <Card className="xl:sticky xl:top-8 xl:self-start">
          <h2 className="section-title">Próximos compromissos</h2>
          <div className="mt-5 max-h-[640px] space-y-4 overflow-y-auto pr-1">
            {upcoming.map((task) => (
              <button key={task.id} type="button" onClick={() => setEditingTask(task)} className="w-full border-b border-slate-100 pb-4 text-left last:border-0">
                <p className="text-xs font-bold text-muted">{formatDate(task.due_date)}</p>
                <p className="mt-2 font-semibold text-ink">{task.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CategoryBadge category={task.category} compact />
                  <PriorityBadge priority={task.priority} />
                </div>
                <AssigneeStack task={task} className="mt-3" />
              </button>
            ))}
            {!upcoming.length && <p className="rounded-2xl bg-white/75 px-4 py-6 text-center text-sm text-muted">Nenhum compromisso pendente.</p>}
          </div>
        </Card>
      </div>

      <TaskPreview preview={preview} onMouseEnter={() => window.clearTimeout(previewTimer.current)} onMouseLeave={schedulePreviewClose} />

      {selectedDate && (
        <DayPanel
          date={selectedDate}
          tasks={selectedTasks}
          onClose={() => setSelectedDate(null)}
          onComplete={handleComplete}
          onCompleteAll={handleCompleteAll}
          onEdit={(task) => {
            setEditingTask(task);
            setSelectedDate(null);
          }}
        />
      )}

      <TaskEditorModal
        task={editingTask}
        categories={categories}
        members={members}
        saving={savingEdit}
        onClose={() => setEditingTask(null)}
        onSave={handleSaveEdit}
      />
    </>
  );
}

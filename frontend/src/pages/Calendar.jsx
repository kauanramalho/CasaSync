import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Edit3, Filter, Plus, RotateCcw, Send, X } from "lucide-react";

import AssigneeStack from "../components/AssigneeStack";
import { CategoryBadge, CategoryGlyph, PriorityBadge, StatusBadge } from "../components/Badges";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import TaskDetailsModal from "../components/TaskDetailsModal";
import TaskEditorModal from "../components/TaskEditorModal";
import { useAppPreferences } from "../hooks/useAppPreferences";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { useToast } from "../hooks/useToast";
import { categoriesApi, familiesApi, integrationsApi, tasksApi } from "../services/api";
import {
  calendarMonthTasks,
  calendarTimeLabel,
  filterCalendarTasks,
  groupCalendarTasksByDay,
  localCalendarDateKey,
  UNASSIGNED_FILTER,
  UNCATEGORIZED_FILTER
} from "../utils/calendar";
import { APP_RESUMED_EVENT, emitAppDataChanged } from "../utils/events";
import { formatDate, normalizeApiError } from "../utils/formatters";
import { syncTaskToGoogleCalendarSafely } from "../utils/googleCalendarTasks";
import { buildMonthDays, getStoredPreferences, getWeekdayLabels, startOfWeek as getPreferenceStartOfWeek } from "../utils/preferences";
import { applyTaskAttachmentChanges, hasTaskAttachmentChanges } from "../utils/taskAttachments";
import { getAssigneeNames, getCategoryHex, getTaskPointLabel, sortTasksForDisplay } from "../utils/tasks";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const viewModes = [
  { key: "month", label: "Mês" },
  { key: "week", label: "Semana" },
  { key: "list", label: "Lista" }
];
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
  return localCalendarDateKey(value);
}

function timeLabel(value) {
  return calendarTimeLabel(value, getStoredPreferences().timezone);
}

function fullDateLabel(date) {
  const datePart = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(date);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  return `${datePart}, ${weekday}`;
}

function shortDateLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function periodLabel(baseDate, viewMode, weekStart) {
  if (viewMode === "week") {
    const days = weekDays(baseDate, weekStart);
    return `${shortDateLabel(days[0])} a ${shortDateLabel(days[6])}`;
  }
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(baseDate);
}

function sortCalendarTasks(tasks = []) {
  return sortTasksForDisplay(tasks);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function CalendarTaskPill({ task, onPreview, onPreviewLeave, onOpen, compact = false }) {
  const color = getCategoryHex(task.category, "#7aa5ff");
  const completed = task.status === "concluida";
  const overdue = task.status === "atrasada";
  const dueTime = timeLabel(task.due_date);
  const assignees = getAssigneeNames(task);

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
      className={clsx(
        "block w-full min-w-0 rounded-xl border px-2 py-1.5 text-left text-xs font-bold transition hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100",
        compact ? "min-h-9" : "min-h-11",
        completed && "opacity-70",
        overdue && "ring-1 ring-rose-300/70"
      )}
      style={{ backgroundColor: `${color}14`, borderColor: `${color}2e`, color }}
      aria-label={`Ver detalhes de ${task.title}, ${dueTime}, status ${task.status}`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDot[task.priority] || priorityDot.media}`} />
        {!compact && <CategoryGlyph category={task.category} className="h-5 w-5 bg-white/80" iconClassName="h-3 w-3" />}
        <span className={clsx("min-w-0 flex-1 truncate", completed && "line-through")}>{task.title}</span>
        {(completed || overdue) && <span className="shrink-0" title={completed ? "Concluída" : "Atrasada"}>{completed ? "✓" : "!"}</span>}
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] font-semibold opacity-80">
        <span className="shrink-0">{dueTime}</span>
        {!compact && assignees && <><span aria-hidden="true">·</span><span className="truncate">{assignees}</span></>}
      </span>
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

function DayPanel({ date, tasks, onClose, onComplete, onCompleteAll, onEdit, onOpenDetails }) {
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
        <div className="border-b border-slate-100 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-6 md:pt-5">
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
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted hover:text-ink" aria-label="Fechar tarefas do dia">
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
              <div key={task.id} className="grid grid-cols-[44px_52px_1fr] gap-3 rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-sm">
                <button
                  type="button"
                  onClick={() => onComplete?.(task)}
                  className={`grid h-10 w-10 place-items-center rounded-full border transition ${
                    task.status === "concluida" ? "border-emerald-400 bg-emerald-400 text-white" : "border-slate-300 text-transparent hover:border-emerald-300"
                  }`}
                  title={task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
                >
                  <Check className="h-4 w-4" />
                </button>
                <span className="pt-1 text-xs font-bold text-muted">{timeLabel(task.due_date)}</span>
                <div className="min-w-0">
                  <button type="button" onClick={() => onOpenDetails?.(task)} className="block max-w-full truncate text-left font-bold text-ink hover:text-blush">
                    {task.title}
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CategoryBadge category={task.category} compact />
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <AssigneeStack task={task} className="min-w-0" />
                    <button type="button" onClick={() => onEdit?.(task)} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-600 transition hover:bg-blue-100 sm:w-fit">
                      <Edit3 className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </div>
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
  const { showToast } = useToast();
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month");
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detailsTask, setDetailsTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [syncingTaskId, setSyncingTaskId] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const previewTimer = useRef(null);

  const load = useCallback(async function load() {
    setLoading(true);
    setError("");
    try {
      const [taskResult, categoryResult, memberResult, calendarResult] = await Promise.allSettled([
        tasksApi.list(),
        categoriesApi.list(),
        familiesApi.members(),
        integrationsApi.googleCalendarStatus()
      ]);
      if (taskResult.status === "rejected") throw taskResult.reason;
      if (categoryResult.status === "rejected") throw categoryResult.reason;
      if (memberResult.status === "rejected") throw memberResult.reason;

      setTasks(taskResult.value);
      setCategories(categoryResult.value);
      setMembers(memberResult.value);
      if (calendarResult.status === "fulfilled") {
        setCalendarStatus(calendarResult.value);
      } else {
        setCalendarStatus(null);
      }
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
    window.addEventListener(APP_RESUMED_EVENT, load);
    return () => {
      window.clearTimeout(previewTimer.current);
      window.removeEventListener(APP_RESUMED_EVENT, load);
    };
  }, [load]);

  const weekdayLabels = useMemo(() => getWeekdayLabels(preferences.weekStart) || weekdays, [preferences.weekStart]);
  const days = useMemo(() => buildMonthDays(baseDate, preferences.weekStart), [baseDate, preferences.weekStart]);
  const week = useMemo(() => weekDays(baseDate, preferences.weekStart), [baseDate, preferences.weekStart]);
  const filteredTasks = useMemo(
    () => filterCalendarTasks(tasks, { memberId: memberFilter, categoryId: categoryFilter }),
    [categoryFilter, memberFilter, tasks]
  );
  const tasksByDay = useMemo(
    () => groupCalendarTasksByDay(filteredTasks, preferences.timezone),
    [filteredTasks, preferences.timezone]
  );
  const memberOptions = useMemo(() => [
    { value: "", label: "Todos os membros" },
    ...members.map((member) => ({
      value: member.user_id || member.user?.id || member.id,
      label: member.user?.name || member.name || "Membro da família"
    })),
    { value: UNASSIGNED_FILTER, label: "Sem responsável" }
  ], [members]);
  const categoryOptions = useMemo(() => [
    { value: "", label: "Todas as categorias" },
    ...categories.map((category) => ({ value: category.id, label: category.name, category })),
    { value: UNCATEGORIZED_FILTER, label: "Sem categoria" }
  ], [categories]);
  const hasActiveFilters = Boolean(memberFilter || categoryFilter);
  const datedTaskCount = useMemo(() => filteredTasks.filter((task) => task.due_date).length, [filteredTasks]);

  useEffect(() => {
    if (!loading && memberFilter && memberFilter !== UNASSIGNED_FILTER && !memberOptions.some((option) => option.value === memberFilter)) {
      setMemberFilter("");
    }
    if (!loading && categoryFilter && categoryFilter !== UNCATEGORIZED_FILTER && !categoryOptions.some((option) => option.value === categoryFilter)) {
      setCategoryFilter("");
    }
  }, [categoryFilter, categoryOptions, loading, memberFilter, memberOptions]);

  const upcoming = useMemo(
    () =>
      filteredTasks
        .filter((task) => task.due_date && task.status !== "concluida")
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 6),
    [filteredTasks]
  );

  const periodTasks = useMemo(
    () => calendarMonthTasks(filteredTasks, baseDate, preferences.timezone),
    [baseDate, filteredTasks, preferences.timezone]
  );

  const listGroups = useMemo(() => {
    return periodTasks.reduce((acc, task) => {
      const key = taskDateKey(task);
      acc[key] = [...(acc[key] || []), task];
      return acc;
    }, {});
  }, [periodTasks]);

  const selectedTasks = selectedDate ? tasksByDay[dateKey(selectedDate)] || [] : [];

  const emptyMessage = useCallback(function emptyMessage(defaultMessage) {
    if (hasActiveFilters) return "Nenhuma tarefa encontrada para esses filtros.";
    if (!tasks.some((task) => task.due_date)) return "Crie uma tarefa com data para ela aparecer no calendário.";
    return defaultMessage;
  }, [hasActiveFilters, tasks]);

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

  const openTaskDetails = useCallback(function openTaskDetails(task) {
    setPreview(null);
    setDetailsTask(task);
  }, []);

  const handleComplete = useCallback(async function handleComplete(task) {
    try {
    const updated = await tasksApi.complete(task.id);
    setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    addNotification({
      title: updated.status === "concluida" ? "Tarefa concluída" : "Tarefa reaberta",
      description: updated.status === "concluida" ? `${updated.title} somou pontos no calendário.` : `${updated.title} voltou para pendente.`,
      type: updated.status === "concluida" ? "done" : "reopened",
      actor: user?.name
    });
    emitAppDataChanged();
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    }
  }, [addNotification, showToast, user?.name]);

  const handleCompleteAll = useCallback(async function handleCompleteAll(dayTasks) {
    const openTasks = dayTasks.filter((task) => task.status !== "concluida");
    if (!openTasks.length) return;
    try {
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
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    }
  }, [addNotification, showToast, user?.name]);

  const handleSaveEdit = useCallback(async function handleSaveEdit(payload, attachmentChanges = {}) {
    if (!editingTask) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const updated = await tasksApi.update(editingTask.id, payload);
      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      const changedAttachments = await applyTaskAttachmentChanges(updated.id, attachmentChanges);
      const calendarResult = attachmentChanges.syncGoogleCalendar
        ? await syncTaskToGoogleCalendarSafely(updated.id)
        : null;
      if (calendarResult && !calendarResult.ok) {
        showToast({ type: "info", message: calendarResult.message });
      }
      const persisted = changedAttachments || calendarResult?.task ? await tasksApi.retrieve(updated.id) : updated;
      addNotification({
        title: "Tarefa editada",
        description: hasTaskAttachmentChanges(attachmentChanges)
          ? `${updated.title} foi atualizada com anexos.`
          : `${updated.title} foi atualizada no calendário.`,
        type: "task",
        actor: user?.name
      });
      setTasks((current) => current.map((task) => (task.id === persisted.id ? persisted : task)));
      showToast({
        type: "success",
        message: calendarResult?.message ? `Tarefa editada com sucesso. ${calendarResult.message}` : "Tarefa editada com sucesso."
      });
      setEditingTask(null);
      emitAppDataChanged();
    } catch (err) {
      const message = normalizeApiError(err);
      setEditError(message);
      showToast({ type: "error", message });
    } finally {
      setSavingEdit(false);
    }
  }, [addNotification, editingTask, showToast, user?.name]);

  const handleSyncCalendar = useCallback(async function handleSyncCalendar(task) {
    if (task.google_calendar_event_id) {
      showToast({ type: "info", message: "Esta tarefa ja esta vinculada ao Google Agenda." });
      return;
    }
    if (!calendarStatus?.can_sync) {
      showToast({ type: "info", message: calendarStatus?.message || "Conecte o Google Agenda antes de sincronizar." });
      return;
    }
    const confirmed = window.confirm(`Enviar "${task.title}" para o Google Agenda?`);
    if (!confirmed) return;

    setSyncingTaskId(task.id);
    try {
      const response = await integrationsApi.syncGoogleCalendarTask(task.id);
      if (response.event_id) {
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? { ...item, google_calendar_event_id: response.event_id, google_calendar_synced_at: new Date().toISOString() }
              : item
          )
        );
      }
      showToast({
        type: response.synced ? "success" : "info",
        message: response.message
      });
    } catch (err) {
      const message = normalizeApiError(err);
      showToast({ type: "error", message });
    } finally {
      setSyncingTaskId("");
    }
  }, [calendarStatus?.can_sync, calendarStatus?.message, showToast]);

  function renderMobileAgendaDays(dayList, emptyMessage, { showEmptyDays = false } = {}) {
    const rows = dayList.map((day) => {
      const key = dateKey(day);
      return { day, key, dayTasks: tasksByDay[key] || [] };
    });
    const hasTasks = rows.some((row) => row.dayTasks.length > 0);
    const visibleRows = showEmptyDays ? rows : rows.filter((row) => row.dayTasks.length > 0);

    return (
      <Card className="p-3 md:hidden">
        {hasTasks || showEmptyDays ? (
          <div className="max-h-[70dvh] space-y-3 overflow-y-auto pr-1">
            {visibleRows.map(({ day, key, dayTasks }) => {
              const visibleTasks = dayTasks.slice(0, 3);
              const hiddenCount = Math.max(0, dayTasks.length - visibleTasks.length);
              const isToday = key === dateKey(new Date());

              return (
                <div key={key} className="rounded-[22px] border border-slate-100 bg-white/80 p-3 shadow-sm">
                  <button type="button" onClick={() => openDay(day)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-left hover:bg-rose-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black capitalize text-ink">{fullDateLabel(day)}</p>
                      <p className="mt-0.5 text-xs font-semibold text-muted">
                        {dayTasks.length ? `${dayTasks.length} ${dayTasks.length === 1 ? "tarefa" : "tarefas"}` : "Livre por aqui"}
                      </p>
                    </div>
                    <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black", isToday ? "bg-blush text-white" : "bg-white text-muted")}>
                      {day.getDate()}
                    </span>
                  </button>
                  {visibleTasks.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {visibleTasks.map((task) => (
                        <CalendarTaskPill key={task.id} task={task} compact onOpen={openTaskDetails} />
                      ))}
                      {hiddenCount > 0 && (
                        <button type="button" onClick={() => openDay(day)} className="min-h-10 rounded-xl px-2 text-xs font-bold text-blush hover:bg-rose-50">
                          +{hiddenCount} {hiddenCount === 1 ? "tarefa" : "tarefas"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">{emptyMessage}</div>
        )}
      </Card>
    );
  }

  function renderMonthView() {
    const monthDays = days.filter((day) => day.getMonth() === baseDate.getMonth());

    return (
      <>
      {renderMobileAgendaDays(monthDays, emptyMessage("Nenhuma tarefa com data neste mês."))}
      <Card className="hidden p-0 md:block">
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
                        <CalendarTaskPill key={task.id} task={task} compact onPreview={showPreview} onPreviewLeave={schedulePreviewClose} onOpen={openTaskDetails} />
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
      </>
    );
  }

  function renderWeekView() {
    return (
      <>
      {renderMobileAgendaDays(week, emptyMessage("Nenhuma tarefa nesta semana."), { showEmptyDays: !hasActiveFilters })}
      <Card className="hidden p-0 md:block">
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
                        <CalendarTaskPill task={task} onPreview={showPreview} onPreviewLeave={schedulePreviewClose} onOpen={openTaskDetails} />
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
      </>
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
                        <button type="button" onClick={() => setDetailsTask(task)} className="block max-w-full truncate text-left font-bold text-ink hover:text-blush">
                          {task.title}
                        </button>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <CategoryBadge category={task.category} compact />
                          <StatusBadge status={task.status} />
                          <button type="button" onClick={() => setEditingTask(task)} className="inline-flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-100">
                            <Edit3 className="h-3 w-3" />
                            Editar
                          </button>
                        </div>
                      </div>
                      <AssigneeStack task={task} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!keys.length && <div className="empty-state">{emptyMessage("Nenhuma tarefa com data neste período.")}</div>}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Calendário"
        user={user}
        action={<Button as={Link} to="/tarefas/nova" className="px-3 sm:px-4"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Nova tarefa</span><span className="sm:hidden">Criar</span></Button>}
      />
      {error && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load} className="inline-flex items-center gap-2 font-bold"><RotateCcw className="h-4 w-4" />Tentar novamente</button>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 sm:flex sm:flex-wrap">
          <button type="button" onClick={() => movePeriod(-1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-muted shadow-card" aria-label="Período anterior">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="min-w-0 flex-1 text-xl font-bold capitalize text-ink sm:min-w-52 sm:flex-none">{periodLabel(baseDate, viewMode, preferences.weekStart)}</h2>
          <button type="button" onClick={() => movePeriod(1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-muted shadow-card" aria-label="Próximo período">
            <ChevronRight className="h-5 w-5" />
          </button>
          <Button variant="secondary" className="col-span-3 w-full sm:col-span-1 sm:w-auto" onClick={() => setBaseDate(new Date())}>
            Hoje
          </Button>
        </div>
        <div className="inline-flex w-full self-start rounded-2xl bg-white p-1 shadow-card sm:w-auto xl:self-auto">
          {viewModes.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setViewMode(item.key)}
              aria-pressed={viewMode === item.key}
              className={`min-h-10 flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition sm:flex-none sm:px-5 ${viewMode === item.key ? "bg-rose-50 text-blush shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blush/10 text-blush">
              <Filter className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold text-ink">Filtrar calendário</h2>
              <p className="mt-1 text-sm text-muted">{datedTaskCount} {datedTaskCount === 1 ? "tarefa com data" : "tarefas com data"} em exibição</p>
            </div>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:w-[min(100%,620px)]">
            <div className="min-w-0">
              <label className="mb-1.5 block text-xs font-bold text-muted">Membro</label>
              <SelectMenu value={memberFilter} options={memberOptions} onChange={setMemberFilter} placeholder="Todos os membros" />
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 block text-xs font-bold text-muted">Categoria</label>
              <SelectMenu value={categoryFilter} options={categoryOptions} onChange={setCategoryFilter} placeholder="Todas as categorias" />
            </div>
          </div>
          {hasActiveFilters && (
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => { setMemberFilter(""); setCategoryFilter(""); }}>
              <RotateCcw className="h-4 w-4" />
              Limpar filtros
            </Button>
          )}
        </div>
      </Card>

      {loading && !tasks.length ? (
        <div className="grid animate-pulse gap-6 xl:grid-cols-[1fr_340px]" aria-label="Carregando calendário" aria-busy="true">
          <div className="glass-panel h-[520px] rounded-[28px]" />
          <div className="glass-panel h-[420px] rounded-[28px]" />
        </div>
      ) : <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {viewMode === "month" && renderMonthView()}
          {viewMode === "week" && renderWeekView()}
          {viewMode === "list" && renderListView()}
        </div>

        <Card className="xl:sticky xl:top-8 xl:self-start">
          <h2 className="section-title">Próximos compromissos</h2>
          <div className="mt-5 max-h-[640px] space-y-4 overflow-y-auto pr-1">
            {upcoming.map((task) => (
              <div key={task.id} className="border-b border-slate-100 pb-4 last:border-0">
                <button type="button" onClick={() => setDetailsTask(task)} className="w-full rounded-2xl px-2 py-2 text-left transition hover:bg-rose-50/70">
                  <p className="text-xs font-bold text-muted">{formatDate(task.due_date)}</p>
                  <p className="mt-2 font-semibold text-ink">{task.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CategoryBadge category={task.category} compact />
                    <PriorityBadge priority={task.priority} />
                  </div>
                  <AssigneeStack task={task} className="mt-3" />
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 w-full px-3 py-2 text-xs"
                  onClick={() => setEditingTask(task)}
                >
                  <Edit3 className="h-4 w-4" />
                  Editar tarefa
                </Button>
                {calendarStatus?.is_enabled && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full px-3 py-2 text-xs"
                    onClick={() => handleSyncCalendar(task)}
                    disabled={syncingTaskId === task.id || !calendarStatus?.can_sync || Boolean(task.google_calendar_event_id)}
                  >
                    <Send className="h-4 w-4" />
                    {task.google_calendar_event_id ? "Ja no Google Agenda" : syncingTaskId === task.id ? "Sincronizando..." : "Sincronizar com Google Agenda"}
                  </Button>
                )}
                {calendarStatus?.is_enabled && !calendarStatus?.can_sync && (
                  <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    {calendarStatus.message}
                  </p>
                )}
              </div>
            ))}
            {!upcoming.length && <p className="empty-state">{emptyMessage("Nenhum compromisso pendente.")}</p>}
          </div>
        </Card>
      </div>}

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
          onOpenDetails={setDetailsTask}
        />
      )}

      <TaskDetailsModal
        task={detailsTask}
        onClose={() => setDetailsTask(null)}
        onEdit={(task) => {
          setDetailsTask(null);
          setSelectedDate(null);
          setEditingTask(task);
        }}
      />

      <TaskEditorModal
        task={editingTask}
        categories={categories}
        members={members}
        saving={savingEdit}
        error={editError}
        onClose={() => {
          setEditError("");
          setEditingTask(null);
        }}
        onSave={handleSaveEdit}
      />
    </>
  );
}

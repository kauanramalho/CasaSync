import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, ListFilter, Plus, Rows3, Search } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import CollapsibleSection from "../components/CollapsibleSection";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import StatCard from "../components/StatCard";
import TaskDeleteConfirmModal from "../components/TaskDeleteConfirmModal";
import TaskDetailsModal from "../components/TaskDetailsModal";
import TaskEditorModal from "../components/TaskEditorModal";
import TaskList from "../components/TaskList";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import useTaskDeletion from "../hooks/useTaskDeletion";
import { useToast } from "../hooks/useToast";
import { categoriesApi, familiesApi, tasksApi } from "../services/api";
import { APP_RESUMED_EVENT, emitAppDataChanged } from "../utils/events";
import { normalizeApiError, priorityLabels, statusLabels } from "../utils/formatters";
import { syncTaskToGoogleCalendarSafely } from "../utils/googleCalendarTasks";
import { applyTaskAttachmentChanges, hasTaskAttachmentChanges } from "../utils/taskAttachments";
import { formatReminderList, normalizeReminderList } from "../utils/taskReminders";
import { getAssigneeNames, getTaskAssigneeIds, getTaskPointLabel, isTaskCompleted, isTaskOpen, sortTasksForDisplay } from "../utils/tasks";
import { matchesTaskStatusFilter, normalizeTaskStatusFilter, taskStatusFilters } from "../utils/taskStatusFilters";

function taskSearchText(task) {
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
    getAssigneeNames(task, "")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function Tasks() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState(normalizeTaskStatusFilter(searchParams.get("status")));
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [detailsTask, setDetailsTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async function load() {
    setLoading(true);
    setError("");
    try {
      const [taskRows, categoryRows, memberRows] = await Promise.all([tasksApi.list(), categoriesApi.list(), familiesApi.members()]);
      setTasks(taskRows);
      setCategories(categoryRows);
      setMembers(memberRows);
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
    return () => window.removeEventListener(APP_RESUMED_EVENT, load);
  }, [load]);

  useEffect(() => {
    const nextSearch = searchParams.get("search") || "";
    const nextStatus = normalizeTaskStatusFilter(searchParams.get("status"));
    setSearch(nextSearch);
    setStatus(nextStatus);
  }, [searchParams]);

  const deferredSearch = useDeferredValue(search);
  const indexedTasks = useMemo(() => tasks.map((task) => ({ task, searchText: taskSearchText(task) })), [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    const matches = indexedTasks.reduce((acc, item) => {
      const task = item.task;
      const matchesStatus = matchesTaskStatusFilter(task, status);
      const matchesCategory = !category || task.category_id === category;
      const matchesAssignee = !assignee || getTaskAssigneeIds(task).includes(assignee);
      const matchesSearch = !normalizedSearch || item.searchText.includes(normalizedSearch);
      if (matchesStatus && matchesCategory && matchesAssignee && matchesSearch) acc.push(task);
      return acc;
    }, []);
    return sortTasksForDisplay(matches);
  }, [indexedTasks, status, category, assignee, deferredSearch]);

  const pendingTasks = useMemo(() => filteredTasks.filter(isTaskOpen), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter(isTaskCompleted), [filteredTasks]);

  const counts = useMemo(
    () =>
      tasks.reduce(
        (acc, task) => {
          acc.all += 1;
          if (task.status === "pendente" || task.status === "em_andamento") acc.pendente += 1;
          if (task.status === "concluida") acc.concluida += 1;
          if (task.status === "atrasada") acc.atrasada += 1;
          return acc;
        },
        { all: 0, pendente: 0, concluida: 0, atrasada: 0 }
      ),
    [tasks]
  );

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Categoria" }, ...categories.map((item) => ({ value: item.id, label: item.name, category: item, helper: item.is_default ? "Padrao da familia" : "Personalizada" }))],
    [categories]
  );

  const memberOptions = useMemo(
    () => [{ value: "", label: "Responsavel" }, ...members.map((member) => ({ value: member.user_id, label: member.user.name, helper: "Membro da familia" }))],
    [members]
  );

  const handleComplete = useCallback(async function handleComplete(task) {
    const updated = await tasksApi.complete(task.id);
    setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    addNotification({
      title: updated.status === "concluida" ? "Tarefa concluida" : "Tarefa reaberta",
      description: updated.status === "concluida" ? `${updated.title} gerou pontos para os responsaveis.` : `${updated.title} voltou para pendente e os pontos foram removidos.`,
      type: updated.status === "concluida" ? "done" : "reopened",
      actor: user?.name
    });
    emitAppDataChanged();
  }, [addNotification, user?.name]);

  const handleSaveEdit = useCallback(async function handleSaveEdit(payload, attachmentChanges = {}) {
    if (!editingTask) return;
    setSavingEdit(true);
    setEditError("");
    setError("");
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
      setTasks((current) => current.map((task) => (task.id === persisted.id ? persisted : task)));
      const previousReminderSummary = formatReminderList(normalizeReminderList(editingTask));
      const reminderSummary = formatReminderList(normalizeReminderList(updated));
      const reminderChanged = previousReminderSummary !== reminderSummary;
      const message = reminderSummary
        ? reminderChanged
          ? "Lembrete ativado para esta tarefa."
          : `Tarefa atualizada com sucesso com lembrete de ${reminderSummary}.`
        : previousReminderSummary
          ? "Lembrete removido desta tarefa."
          : hasTaskAttachmentChanges(attachmentChanges)
            ? "Tarefa e anexos atualizados com sucesso."
            : "Tarefa atualizada com sucesso.";
      addNotification({
        title: reminderSummary ? "Lembrete da tarefa salvo" : "Tarefa editada",
        description: message,
        type: reminderSummary || previousReminderSummary ? "reminder" : "task",
        actor: user?.name
      });
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

  const handleTaskDeleted = useCallback(function handleTaskDeleted(task) {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setDetailsTask((current) => (current?.id === task.id ? null : current));
    setEditingTask((current) => (current?.id === task.id ? null : current));
  }, []);

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

  const clearFilters = useCallback(function clearFilters() {
    setCategory("");
    setAssignee("");
    setSearch("");
    setStatus("all");
    setSearchParams({});
  }, [setSearchParams]);

  const selectStatus = useCallback(function selectStatus(value) {
    const nextStatus = normalizeTaskStatusFilter(value);
    setStatus(nextStatus);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextStatus === "all") next.delete("status");
      else next.set("status", nextStatus);
      return next;
    });
  }, [setSearchParams]);

  const updateSearch = useCallback(function updateSearch(value) {
    setSearch(value);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("search", value);
      else next.delete("search");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const advancedFilterCount = Number(Boolean(category)) + Number(Boolean(assignee));
  const hasFilters = status !== "all" || Boolean(search || category || assignee);
  const selectedStatusLabel = taskStatusFilters.find((filter) => filter.key === status)?.label;

  const openEditor = useCallback(function openEditor(task) {
    setEditError("");
    setEditingTask(task);
  }, []);

  const openDetails = useCallback(function openDetails(task) {
    setDetailsTask(task);
  }, []);

  const openEditorFromDetails = useCallback(function openEditorFromDetails(task) {
    setDetailsTask(null);
    openEditor(task);
  }, [openEditor]);

  return (
    <>
      <PageHeader
        title="Tarefas"
        user={user}
        action={
          <Button as={Link} to="/tarefas/nova">
            <Plus className="h-5 w-5" />
            Nova tarefa
          </Button>
        }
      />

      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4" aria-label="Filtrar tarefas por status">
        <StatCard icon={Rows3} label="Todas" value={counts.all} tone="blue" compact active={status === "all"} onClick={() => selectStatus("all")} />
        <StatCard icon={Clock3} label="Pendentes" value={counts.pendente} tone="orange" compact active={status === "pendente"} onClick={() => selectStatus("pendente")} />
        <StatCard icon={CheckCircle2} label="Concluídas" value={counts.concluida} tone="emerald" compact active={status === "concluida"} onClick={() => selectStatus("concluida")} />
        <StatCard icon={AlertCircle} label="Atrasadas" value={counts.atrasada} tone="rose" compact active={status === "atrasada"} onClick={() => selectStatus("atrasada")} />
      </div>

      <Card className="mt-4 !p-3 sm:!p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input aria-label="Buscar nesta lista" className="soft-input pl-10" placeholder="Buscar nesta lista..." value={search} onChange={(event) => updateSearch(event.target.value)} />
        </div>
        <CollapsibleSection title="Mais filtros" icon={ListFilter} count={advancedFilterCount || undefined}>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <SelectMenu aria-label="Filtrar por categoria" value={category} onChange={setCategory} options={categoryOptions} />
            <SelectMenu aria-label="Filtrar por responsável" value={assignee} onChange={setAssignee} options={memberOptions} />
          </div>
        </CollapsibleSection>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs font-semibold text-muted" role="status">{loading ? "Carregando tarefas..." : `${selectedStatusLabel}: ${filteredTasks.length} de ${counts.all} tarefas`}</p>
          {hasFilters && <button type="button" onClick={clearFilters} className="min-h-11 rounded-xl px-2 text-xs font-bold text-blush">Limpar filtros</button>}
        </div>
        {advancedFilterCount > 0 && (
          <p className="mt-2 break-words text-xs text-muted">{[categories.find((item) => item.id === category)?.name, members.find((item) => item.user_id === assignee)?.user.name].filter(Boolean).join(" · ")}</p>
        )}
      </Card>

      <div className="mt-4 space-y-3" aria-busy={loading}>
        {status !== "concluida" && (
          <Card className="!p-0">
            <CollapsibleSection key={`pending-${status}`} title={status === "atrasada" ? "Tarefas atrasadas" : "Tarefas em aberto"} icon={Clock3} count={pendingTasks.length} defaultOpen={pendingTasks.length > 0}>
              <TaskList
                tasks={pendingTasks}
                onComplete={handleComplete}
                onEdit={openEditor}
                onDelete={requestTaskDelete}
                onOpenDetails={openDetails}
                emptyMessage="Nenhuma tarefa em aberto com estes filtros."
              />
            </CollapsibleSection>
          </Card>
        )}

        {(status === "all" || status === "concluida") && (
          <Card className="!p-0">
            <CollapsibleSection key={`completed-${status}`} title="Tarefas concluídas" icon={CheckCircle2} count={completedTasks.length} defaultOpen={status === "concluida" && completedTasks.length > 0}>
              <TaskList
                tasks={completedTasks}
                onComplete={handleComplete}
                onEdit={openEditor}
                onDelete={requestTaskDelete}
                onOpenDetails={openDetails}
                emptyMessage="Nenhuma tarefa concluída com estes filtros."
              />
            </CollapsibleSection>
          </Card>
        )}
      </div>

      <TaskDetailsModal
        task={detailsTask}
        onClose={() => setDetailsTask(null)}
        onEdit={openEditorFromDetails}
        onDelete={requestTaskDelete}
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

      <TaskDeleteConfirmModal
        task={pendingDeleteTask}
        deleting={Boolean(deletingTaskId)}
        onCancel={cancelTaskDelete}
        onConfirm={confirmTaskDelete}
      />
    </>
  );
}

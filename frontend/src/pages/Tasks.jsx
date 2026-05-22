import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock3, ListFilter, Plus, Rows3, Search } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import StatCard from "../components/StatCard";
import TaskDetailsModal from "../components/TaskDetailsModal";
import TaskEditorModal from "../components/TaskEditorModal";
import TaskList from "../components/TaskList";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { useToast } from "../hooks/useToast";
import { categoriesApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError, priorityLabels, statusLabels } from "../utils/formatters";
import { syncTaskToGoogleCalendarSafely } from "../utils/googleCalendarTasks";
import { applyTaskAttachmentChanges, hasTaskAttachmentChanges } from "../utils/taskAttachments";
import { formatReminderList, normalizeReminderList } from "../utils/taskReminders";
import { getAssigneeNames, getTaskAssigneeIds, getTaskPointLabel, isTaskCompleted, isTaskOpen, sortTasksForDisplay } from "../utils/tasks";

const statusTabs = [
  { key: "all", label: "Todas" },
  { key: "pendente", label: "Pendentes" },
  { key: "concluida", label: "Concluidas" },
  { key: "atrasada", label: "Atrasadas" }
];

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
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [detailsTask, setDetailsTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(true);

  const load = useCallback(async function load() {
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
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const nextSearch = searchParams.get("search") || "";
    const nextStatus = searchParams.get("status") || "all";
    setSearch(nextSearch);
    setStatus(nextStatus);
  }, [searchParams]);

  const deferredSearch = useDeferredValue(search);
  const indexedTasks = useMemo(() => tasks.map((task) => ({ task, searchText: taskSearchText(task) })), [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    const matches = indexedTasks.reduce((acc, item) => {
      const task = item.task;
      const matchesStatus = status === "all" || (status === "pendente" ? ["pendente", "em_andamento"].includes(task.status) : task.status === status);
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

  const handleDelete = useCallback(async function handleDelete(task) {
    const confirmed = window.confirm(`Excluir a tarefa "${task.title}"? Essa acao tambem cancela o lembrete associado.`);
    if (!confirmed) return;
    try {
      await tasksApi.delete(task.id);
      addNotification({
        title: "Tarefa excluida",
        description: `${task.title} saiu da lista da casa.`,
        type: "task",
        actor: user?.name
      });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      showToast({ type: "success", message: "Tarefa excluida com sucesso." });
      emitAppDataChanged();
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    }
  }, [addNotification, showToast, user?.name]);

  const clearFilters = useCallback(function clearFilters() {
    setCategory("");
    setAssignee("");
    setSearch("");
    setStatus("all");
    setSearchParams({});
  }, [setSearchParams]);

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Rows3} label="Todas" value={counts.all} hint="tarefas registradas" tone="blue" />
        <StatCard icon={Clock3} label="Pendentes" value={counts.pendente} hint="em aberto" tone="orange" />
        <StatCard icon={CheckCircle2} label="Concluidas" value={counts.concluida} hint="com pontos" tone="emerald" />
        <StatCard icon={AlertCircle} label="Atrasadas" value={counts.atrasada} hint="atencao hoje" tone="rose" />
      </div>

      <Card className="mt-6">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 ${
                  status === tab.key ? "bg-rose-50 text-blush shadow-card" : "bg-white text-muted hover:text-ink"
                }`}
              >
                {tab.label} <span className="ml-2 rounded-full bg-white px-2 py-0.5">{counts[tab.key]}</span>
              </button>
            ))}
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
            <div className="relative sm:col-span-2 xl:w-64">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="soft-input pl-10" placeholder="Buscar por nome, status, pontos..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <SelectMenu className="xl:w-48" value={category} onChange={setCategory} options={categoryOptions} />
            <SelectMenu className="xl:w-48" value={assignee} onChange={setAssignee} options={memberOptions} />
            <Button variant="secondary" className="w-full sm:w-auto" onClick={clearFilters}>
              <ListFilter className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </div>
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="section-title">Tarefas pendentes</h2>
                <p className="mt-1 text-sm font-semibold text-muted">Abertas, em andamento e atrasadas.</p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-600">
                {pendingTasks.length} {pendingTasks.length === 1 ? "tarefa" : "tarefas"}
              </span>
            </div>
            <TaskList
              tasks={pendingTasks}
              onComplete={handleComplete}
              onEdit={openEditor}
              onDelete={handleDelete}
              onOpenDetails={openDetails}
              emptyMessage="Nenhuma tarefa pendente encontrada."
            />
          </section>

          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="section-title">Tarefas concluidas</h2>
                <p className="mt-1 text-sm font-semibold text-muted">Finalizadas pela familia.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600">
                  {completedTasks.length} {completedTasks.length === 1 ? "tarefa" : "tarefas"}
                </span>
                <Button
                  variant="secondary"
                  className="px-3 py-2 text-sm"
                  onClick={() => setCompletedExpanded((current) => !current)}
                  aria-expanded={completedExpanded}
                  aria-controls="completed-tasks-section"
                >
                  {completedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {completedExpanded ? "Recolher" : "Expandir"}
                </Button>
              </div>
            </div>
            {completedExpanded && (
              <div id="completed-tasks-section">
                <TaskList
                  tasks={completedTasks}
                  onComplete={handleComplete}
                  onEdit={openEditor}
                  onDelete={handleDelete}
                  onOpenDetails={openDetails}
                  emptyMessage="Nenhuma tarefa concluida encontrada."
                />
              </div>
            )}
          </section>
        </div>
      </Card>

      <TaskDetailsModal
        task={detailsTask}
        onClose={() => setDetailsTask(null)}
        onEdit={openEditorFromDetails}
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

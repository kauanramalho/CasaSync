import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, ListFilter, Plus, Rows3, Search } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import StatCard from "../components/StatCard";
import TaskEditorModal from "../components/TaskEditorModal";
import TaskList from "../components/TaskList";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { categoriesApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError, priorityLabels, statusLabels } from "../utils/formatters";
import { formatReminderLead } from "../utils/taskReminders";
import { getAssigneeNames, getTaskAssigneeIds, getTaskPointLabel } from "../utils/tasks";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editError, setEditError] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
    return indexedTasks.reduce((acc, item) => {
      const task = item.task;
      const matchesStatus = status === "all" || (status === "pendente" ? ["pendente", "em_andamento"].includes(task.status) : task.status === status);
      const matchesCategory = !category || task.category_id === category;
      const matchesAssignee = !assignee || getTaskAssigneeIds(task).includes(assignee);
      const matchesSearch = !normalizedSearch || item.searchText.includes(normalizedSearch);
      if (matchesStatus && matchesCategory && matchesAssignee && matchesSearch) acc.push(task);
      return acc;
    }, []);
  }, [indexedTasks, status, category, assignee, deferredSearch]);

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

  const handleSaveEdit = useCallback(async function handleSaveEdit(payload) {
    if (!editingTask) return;
    setSavingEdit(true);
    setEditError("");
    setError("");
    setSuccess("");
    try {
      const updated = await tasksApi.update(editingTask.id, payload);
      setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
      const reminderChanged = Boolean(editingTask.reminder_enabled) !== Boolean(updated.reminder_enabled);
      const reminderLead = formatReminderLead(updated.reminder_value, updated.reminder_unit);
      const message = updated.reminder_enabled
        ? reminderChanged
          ? "Lembrete ativado para esta tarefa."
          : `Tarefa atualizada com sucesso${reminderLead ? ` com lembrete de ${reminderLead}` : ""}.`
        : editingTask.reminder_enabled
          ? "Lembrete removido desta tarefa."
          : "Tarefa atualizada com sucesso.";
      addNotification({
        title: updated.reminder_enabled ? "Lembrete da tarefa salvo" : "Tarefa editada",
        description: message,
        type: updated.reminder_enabled || editingTask.reminder_enabled ? "reminder" : "task",
        actor: user?.name
      });
      setSuccess(message);
      setEditingTask(null);
      emitAppDataChanged();
    } catch (err) {
      setEditError(normalizeApiError(err));
    } finally {
      setSavingEdit(false);
    }
  }, [addNotification, editingTask, user?.name]);

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
      emitAppDataChanged();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }, [addNotification, user?.name]);

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
      {success && <p className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Rows3} label="Todas" value={counts.all} hint="tarefas registradas" tone="blue" />
        <StatCard icon={Clock3} label="Pendentes" value={counts.pendente} hint="em aberto" tone="orange" />
        <StatCard icon={CheckCircle2} label="Concluidas" value={counts.concluida} hint="com pontos" tone="emerald" />
        <StatCard icon={AlertCircle} label="Atrasadas" value={counts.atrasada} hint="atencao hoje" tone="rose" />
      </div>

      <Card className="mt-6">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 ${
                  status === tab.key ? "bg-rose-50 text-blush shadow-card" : "bg-white text-muted hover:text-ink"
                }`}
              >
                {tab.label} <span className="ml-2 rounded-full bg-white px-2 py-0.5">{counts[tab.key]}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
            <div className="relative sm:col-span-2 xl:w-64">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="soft-input pl-10" placeholder="Buscar por nome, status, pontos..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <SelectMenu className="xl:w-48" value={category} onChange={setCategory} options={categoryOptions} />
            <SelectMenu className="xl:w-48" value={assignee} onChange={setAssignee} options={memberOptions} />
            <Button variant="secondary" onClick={clearFilters}>
              <ListFilter className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </div>
        <TaskList
          tasks={filteredTasks}
          onComplete={handleComplete}
          onEdit={openEditor}
          onDelete={handleDelete}
        />
      </Card>

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

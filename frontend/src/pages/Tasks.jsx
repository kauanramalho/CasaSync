import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, ListFilter, Plus, Rows3, Search } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import TaskEditorModal from "../components/TaskEditorModal";
import TaskList from "../components/TaskList";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { categoriesApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";
import { getTaskAssigneeIds } from "../utils/tasks";

const statusTabs = [
  { key: "all", label: "Todas" },
  { key: "pendente", label: "Pendentes" },
  { key: "concluida", label: "Concluídas" },
  { key: "atrasada", label: "Atrasadas" }
];

export default function Tasks() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setError("");
    try {
      const [taskRows, categoryRows, memberRows] = await Promise.all([tasksApi.list(), categoriesApi.list(), familiesApi.members()]);
      setTasks(taskRows);
      setCategories(categoryRows);
      setMembers(memberRows);
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesStatus = status === "all" || task.status === status;
      const matchesCategory = !category || task.category_id === category;
      const matchesAssignee = !assignee || getTaskAssigneeIds(task).includes(assignee);
      const matchesSearch = !search || task.title.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesCategory && matchesAssignee && matchesSearch;
    });
  }, [tasks, status, category, assignee, search]);

  const counts = {
    all: tasks.length,
    pendente: tasks.filter((task) => task.status === "pendente" || task.status === "em_andamento").length,
    concluida: tasks.filter((task) => task.status === "concluida").length,
    atrasada: tasks.filter((task) => task.status === "atrasada").length
  };

  async function handleComplete(task) {
    const updated = await tasksApi.complete(task.id);
    addNotification({
      title: updated.status === "concluida" ? "Tarefa concluída" : "Tarefa reaberta",
      description: updated.status === "concluida" ? `${updated.title} gerou pontos para os responsáveis.` : `${updated.title} voltou para pendente e os pontos foram removidos.`,
      type: updated.status === "concluida" ? "done" : "reopened",
      actor: user?.name
    });
    emitAppDataChanged();
    load();
  }

  async function handleSaveEdit(payload) {
    if (!editingTask) return;
    setSavingEdit(true);
    try {
      const updated = await tasksApi.update(editingTask.id, payload);
      addNotification({
        title: "Tarefa editada",
        description: `${updated.title} foi atualizada. Responsáveis, prazo, prioridade e status já refletem nos relatórios.`,
        type: "task",
        actor: user?.name
      });
      setEditingTask(null);
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSavingEdit(false);
    }
  }

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
        <StatCard icon={CheckCircle2} label="Concluídas" value={counts.concluida} hint="com pontos" tone="emerald" />
        <StatCard icon={AlertCircle} label="Atrasadas" value={counts.atrasada} hint="atenção hoje" tone="rose" />
      </div>

      <Card className="mt-6">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatus(tab.key)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  status === tab.key ? "bg-rose-50 text-blush" : "bg-white text-muted hover:text-ink"
                }`}
              >
                {tab.label} <span className="ml-2 rounded-full bg-white px-2 py-0.5">{counts[tab.key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="soft-input w-64 pl-10" placeholder="Buscar tarefa" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className="soft-input w-48" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Categoria</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select className="soft-input w-48" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">Responsável</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.user.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={() => { setCategory(""); setAssignee(""); setSearch(""); setStatus("all"); }}>
              <ListFilter className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </div>
        <TaskList tasks={filteredTasks} onComplete={handleComplete} onEdit={setEditingTask} />
      </Card>

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


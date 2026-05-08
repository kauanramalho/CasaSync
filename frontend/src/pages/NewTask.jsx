import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Plus } from "lucide-react";

import AssigneePicker from "../components/AssigneePicker";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { categoriesApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError, toIsoOrNull } from "../utils/formatters";

export default function NewTask() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignee_ids: [],
    category_id: "",
    due_date: "",
    priority: "media",
    status: "pendente"
  });

  useEffect(() => {
    Promise.all([categoriesApi.list(), familiesApi.members()])
      .then(([categoryRows, memberRows]) => {
        setCategories(categoryRows);
        setMembers(memberRows);
      })
      .catch((err) => setError(normalizeApiError(err)));
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await tasksApi.create({
        ...form,
        assignee_id: form.assignee_ids[0] || undefined,
        assignee_ids: form.assignee_ids,
        category_id: form.category_id || undefined,
        due_date: toIsoOrNull(form.due_date)
      });
      addNotification({
        title: "Nova tarefa criada",
        description: `${form.title} entrou na lista da casa.`,
        type: "task",
        actor: user?.name
      });
      emitAppDataChanged();
      navigate("/tarefas");
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Nova tarefa" subtitle="Crie uma responsabilidade com contexto, prazo, prioridade e pontuação." user={user} />

      <Card className="mx-auto max-w-4xl">
        <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink">Título</label>
            <input className="soft-input" value={form.title} onChange={(event) => updateField("title", event.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink">Descrição</label>
            <textarea className="soft-input min-h-28 resize-none" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink">Responsáveis</label>
            <AssigneePicker members={members} value={form.assignee_ids} onChange={(value) => updateField("assignee_ids", value)} />
            <p className="mt-2 text-xs font-semibold text-muted">Se ninguém for selecionado, a tarefa fica para você.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Categoria</label>
            <select className="soft-input" value={form.category_id} onChange={(event) => updateField("category_id", event.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Prazo</label>
            <div className="relative">
              <CalendarClock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <input className="soft-input pl-12" type="datetime-local" value={form.due_date} onChange={(event) => updateField("due_date", event.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Prioridade</label>
            <select className="soft-input" value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
              <option value="baixa">Baixa · 5 pontos</option>
              <option value="media">Média · 10 pontos</option>
              <option value="alta">Alta · 20 pontos</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Status</label>
            <select className="soft-input" value={form.status} onChange={(event) => updateField("status", event.target.value)}>
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
          {error && <p className="md:col-span-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit">
              <Plus className="h-5 w-5" />
              Criar tarefa
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}


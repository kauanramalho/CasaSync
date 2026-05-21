import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import AssigneePicker from "../components/AssigneePicker";
import Button from "../components/Button";
import Card from "../components/Card";
import DateTimePicker from "../components/DateTimePicker";
import ImageTaskImportPanel from "../components/ImageTaskImportPanel";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import TaskAttachmentField from "../components/TaskAttachmentField";
import TaskReminderFields from "../components/TaskReminderFields";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { useToast } from "../hooks/useToast";
import { categoriesApi, familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError, toIsoOrNull } from "../utils/formatters";
import { applyTaskAttachmentChanges } from "../utils/taskAttachments";
import { formatReminderLead, getReminderPayload, getReminderValidationError } from "../utils/taskReminders";

export default function NewTask() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignee_ids: [],
    category_id: "",
    due_date: "",
    priority: "media",
    status: "pendente",
    reminder_enabled: false,
    reminder_value: null,
    reminder_unit: null
  });

  useEffect(() => {
    Promise.all([categoriesApi.list(), familiesApi.members()])
      .then(([categoryRows, memberRows]) => {
        setCategories(categoryRows);
        setMembers(memberRows);
      })
      .catch((err) => setError(normalizeApiError(err)));
  }, []);

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Sem categoria" },
      ...categories.map((category) => ({
        value: category.id,
        label: category.name,
        category,
        helper: category.is_default ? "Padrao da familia" : "Personalizada"
      }))
    ],
    [categories]
  );

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "due_date" && !value) {
        next.reminder_enabled = false;
        next.reminder_value = null;
        next.reminder_unit = null;
      }
      return next;
    });
  }

  function updateReminder(values) {
    setForm((current) => ({ ...current, ...values }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const reminderError = getReminderValidationError(form);
    if (reminderError) {
      setError(reminderError);
      return;
    }
    setSaving(true);
    try {
      const created = await tasksApi.create({
        ...form,
        assignee_id: form.assignee_ids[0] || undefined,
        assignee_ids: form.assignee_ids,
        category_id: form.category_id || undefined,
        due_date: toIsoOrNull(form.due_date),
        ...getReminderPayload(form)
      });
      if (pendingFiles.length) {
        await applyTaskAttachmentChanges(created.id, { pendingFiles });
      }
      const notificationDescription = created.reminder_enabled
        ? `Lembrete ativado para ${formatReminderLead(created.reminder_value, created.reminder_unit)}.`
        : pendingFiles.length
          ? `${created.title} entrou na lista da casa com anexo.`
          : `${created.title} entrou na lista da casa.`;
      addNotification({
        title: "Nova tarefa criada",
        description: notificationDescription,
        type: created.reminder_enabled ? "reminder" : "task",
        actor: user?.name
      });
      showToast({ type: "success", message: "Tarefa criada com sucesso." });
      emitAppDataChanged();
      navigate("/tarefas");
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Nova tarefa" subtitle="Crie uma responsabilidade com contexto, prazo, prioridade e pontuacao." user={user} />

      <ImageTaskImportPanel categories={categories} members={members} />

      <Card className="mx-auto max-w-4xl">
        <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink">Titulo</label>
            <input className="soft-input" value={form.title} onChange={(event) => updateField("title", event.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink">Descricao</label>
            <textarea className="soft-input min-h-28 resize-none" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink">Responsaveis</label>
            <AssigneePicker members={members} value={form.assignee_ids} onChange={(value) => updateField("assignee_ids", value)} />
            <p className="mt-2 text-xs font-semibold text-muted">Se ninguem for selecionado, a tarefa fica para voce.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Categoria</label>
            <SelectMenu value={form.category_id} onChange={(value) => updateField("category_id", value)} options={categoryOptions} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Prazo</label>
            <DateTimePicker value={form.due_date} onChange={(value) => updateField("due_date", value)} />
          </div>
          <TaskReminderFields form={form} onChange={updateReminder} />
          <TaskAttachmentField pendingFiles={pendingFiles} onPendingFilesChange={setPendingFiles} disabled={saving} onError={setError} />
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Prioridade</label>
            <SelectMenu
              value={form.priority}
              onChange={(value) => updateField("priority", value)}
              options={[
                { value: "baixa", label: "Baixa", helper: "5 pontos" },
                { value: "media", label: "Media", helper: "10 pontos" },
                { value: "alta", label: "Alta", helper: "20 pontos" }
              ]}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Status</label>
            <SelectMenu
              value={form.status}
              onChange={(value) => updateField("status", value)}
              options={[
                { value: "pendente", label: "Pendente", helper: "Entra na fila" },
                { value: "em_andamento", label: "Em andamento", helper: "Ja comecou" },
                { value: "concluida", label: "Concluida", helper: "Ja pontua" }
              ]}
            />
          </div>
          {error && <p className="md:col-span-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="md:col-span-2 flex flex-col sm:flex-row sm:justify-end">
            <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
              <Plus className="h-5 w-5" />
              {saving ? "Criando..." : "Criar tarefa"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

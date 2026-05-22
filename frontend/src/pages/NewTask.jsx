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
import { categoriesApi, familiesApi, integrationsApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError, toIsoOrNull } from "../utils/formatters";
import { hasGoogleCalendarDateTime, syncTaskToGoogleCalendarSafely } from "../utils/googleCalendarTasks";
import { applyTaskAttachmentChanges } from "../utils/taskAttachments";
import { formatReminderList, getReminderPayload, getReminderValidationError, normalizeReminderList } from "../utils/taskReminders";

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
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [syncGoogleCalendar, setSyncGoogleCalendar] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignee_ids: [],
    category_id: "",
    due_date: "",
    priority: "media",
    status: "pendente",
    reminders: [],
    reminder_enabled: false,
    reminder_value: null,
    reminder_unit: null
  });

  useEffect(() => {
    Promise.allSettled([categoriesApi.list(), familiesApi.members(), integrationsApi.googleCalendarStatus()])
      .then(([categoryResult, memberResult, calendarResult]) => {
        if (categoryResult.status === "fulfilled") setCategories(categoryResult.value);
        if (memberResult.status === "fulfilled") setMembers(memberResult.value);
        if (calendarResult.status === "fulfilled") setCalendarStatus(calendarResult.value);
        if (categoryResult.status === "rejected" || memberResult.status === "rejected") {
          throw categoryResult.reason || memberResult.reason;
        }
      })
      .catch((err) => setError(normalizeApiError(err)));
  }, []);

  useEffect(() => {
    if (!calendarStatus?.can_sync) setSyncGoogleCalendar(false);
  }, [calendarStatus?.can_sync]);

  useEffect(() => {
    if (!hasGoogleCalendarDateTime(form.due_date)) setSyncGoogleCalendar(false);
  }, [form.due_date]);

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
        next.reminders = [];
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
      let calendarMessage = "";
      if (syncGoogleCalendar && calendarStatus?.can_sync) {
        if (!hasGoogleCalendarDateTime(form.due_date)) {
          calendarMessage = "Google Agenda nao foi sincronizado porque falta data e horario.";
        } else {
          const calendarResult = await syncTaskToGoogleCalendarSafely(created.id);
          calendarMessage = calendarResult.message;
          if (!calendarResult.ok) {
            showToast({ type: "info", message: calendarMessage });
          }
        }
      }
      const reminderSummary = formatReminderList(normalizeReminderList(created));
      const notificationDescription = reminderSummary
        ? `Lembrete ativado para ${reminderSummary}.`
        : pendingFiles.length
          ? `${created.title} entrou na lista da casa com anexo.`
          : `${created.title} entrou na lista da casa.`;
      addNotification({
        title: "Nova tarefa criada",
        description: notificationDescription,
        type: reminderSummary ? "reminder" : "task",
        actor: user?.name
      });
      showToast({
        type: "success",
        message: calendarMessage ? `Tarefa criada com sucesso. ${calendarMessage}` : "Tarefa criada com sucesso."
      });
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
          {calendarStatus?.is_enabled && (
            <label
              className={`md:col-span-2 flex items-start gap-3 rounded-2xl border px-3 py-3 text-xs font-bold ${
                calendarStatus?.can_sync && hasGoogleCalendarDateTime(form.due_date)
                  ? "border-blue-100 bg-blue-50/70 text-blue-700"
                  : "border-slate-200 bg-slate-100 text-muted"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 accent-blue-600"
                checked={syncGoogleCalendar}
                onChange={(event) => setSyncGoogleCalendar(event.target.checked)}
                disabled={!calendarStatus?.can_sync || !hasGoogleCalendarDateTime(form.due_date) || saving}
              />
              <span>
                Tambem adicionar esta tarefa ao Google Agenda quando houver data e horario.
                {!calendarStatus?.can_sync
                  ? ` ${calendarStatus?.message || "Conecte o Google Agenda nas configuracoes."}`
                  : !hasGoogleCalendarDateTime(form.due_date)
                    ? " Defina data e horario para sincronizar."
                    : ""}
              </span>
            </label>
          )}
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

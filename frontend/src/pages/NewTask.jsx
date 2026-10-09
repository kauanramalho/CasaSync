import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Plus, Sparkles } from "lucide-react";

import AssigneePicker from "../components/AssigneePicker";
import Button from "../components/Button";
import Card from "../components/Card";
import DateTimePicker from "../components/DateTimePicker";
import ImageTaskImportPanel from "../components/ImageTaskImportPanel";
import GoogleCalendarOptIn from "../components/GoogleCalendarOptIn";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import TaskAttachmentField from "../components/TaskAttachmentField";
import TaskReminderFields from "../components/TaskReminderFields";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { categoriesApi, familiesApi, integrationsApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError, toIsoOrNull } from "../utils/formatters";
import { hasGoogleCalendarDateTime, syncTaskToGoogleCalendarSafely } from "../utils/googleCalendarTasks";
import { applyTaskAttachmentChanges } from "../utils/taskAttachments";
import { getReminderPayload, getReminderValidationError } from "../utils/taskReminders";

export default function NewTask() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [syncGoogleCalendar, setSyncGoogleCalendar] = useState(false);
  const [aiExpanded, setAIExpanded] = useState(false);
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
    if (savingRef.current) return;
    setError("");
    const reminderError = getReminderValidationError(form);
    if (reminderError) {
      setError(reminderError);
      return;
    }
    savingRef.current = true;
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
      // The canonical family notification is persisted by the backend.
      showToast({
        type: "success",
        message: calendarMessage ? `Tarefa criada com sucesso. ${calendarMessage}` : "Tarefa criada com sucesso."
      });
      emitAppDataChanged();
      navigate("/");
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Nova tarefa" subtitle="O que precisa ser feito?" user={user} />

      <Card className="mx-auto max-w-4xl">
        <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="new-task-title" className="mb-2 block text-sm font-semibold text-ink">Título</label>
            <input id="new-task-title" className="soft-input" value={form.title} onChange={(event) => updateField("title", event.target.value)} minLength={2} maxLength={180} required />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-ink">Responsáveis</label>
            <AssigneePicker members={members} value={form.assignee_ids} onChange={(value) => updateField("assignee_ids", value)} />
            <p className="mt-2 text-xs font-semibold text-muted">Sem seleção, a tarefa fica para você.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Categoria</label>
            <SelectMenu aria-label="Categoria" value={form.category_id} onChange={(value) => updateField("category_id", value)} options={categoryOptions} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-ink">Prazo</label>
            <DateTimePicker value={form.due_date} onChange={(value) => updateField("due_date", value)} />
          </div>
          <details className="group md:col-span-2 rounded-2xl border border-slate-200">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-ink">
              Lembretes {form.reminders.length > 0 && <span className="ml-auto text-xs text-muted">{form.reminders.length} ativo(s)</span>}
              <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
            </summary>
            <TaskReminderFields form={form} onChange={updateReminder} />
          </details>
          {calendarStatus?.is_enabled && (
            <div className="md:col-span-2"><GoogleCalendarOptIn checked={syncGoogleCalendar} onChange={setSyncGoogleCalendar} canSync={calendarStatus.can_sync} hasDateTime={hasGoogleCalendarDateTime(form.due_date)} busy={saving} /></div>
          )}
          <details className="group md:col-span-2 rounded-2xl border border-slate-200">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-ink">
              Descrição, anexos e opções <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 p-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="new-task-description" className="mb-2 block text-sm font-semibold text-ink">Descrição</label>
                <textarea id="new-task-description" className="soft-input min-h-24 resize-none" value={form.description} onChange={(event) => updateField("description", event.target.value)} maxLength={1200} />
              </div>
              <TaskAttachmentField pendingFiles={pendingFiles} onPendingFilesChange={setPendingFiles} disabled={saving} onError={setError} />
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">Prioridade</label>
                <SelectMenu
                  aria-label="Prioridade"
                  value={form.priority}
                  onChange={(value) => updateField("priority", value)}
                  options={[
                    { value: "baixa", label: "Baixa", helper: "5 pontos" },
                    { value: "media", label: "Média", helper: "10 pontos" },
                    { value: "alta", label: "Alta", helper: "20 pontos" }
                  ]}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">Status</label>
                <SelectMenu
                  aria-label="Status"
                  value={form.status}
                  onChange={(value) => updateField("status", value)}
                  options={[
                    { value: "pendente", label: "Pendente", helper: "Entra na fila" },
                    { value: "em_andamento", label: "Em andamento", helper: "Já começou" },
                    { value: "concluida", label: "Concluída", helper: "Já pontua" }
                  ]}
                />
              </div>
            </div>
          </details>
          {error && <p className="md:col-span-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="md:col-span-2 flex flex-col sm:flex-row sm:justify-end">
            <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
              <Plus className="h-5 w-5" />
              {saving ? "Criando..." : "Criar tarefa"}
            </Button>
          </div>
        </form>
      </Card>
      <details onToggle={(event) => setAIExpanded(event.currentTarget.open)} className="group mx-auto mt-4 max-w-4xl rounded-[24px] border border-slate-200 bg-white/75 shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 font-bold text-ink">
          <Sparkles className="h-5 w-5 shrink-0 text-blush" />
          Criar com IA
          <ChevronDown className="ml-auto h-5 w-5 shrink-0 transition group-open:rotate-180" />
        </summary>
        <ImageTaskImportPanel categories={categories} members={members} currentUserId={user?.id} active={aiExpanded} />
      </details>
    </>
  );
}

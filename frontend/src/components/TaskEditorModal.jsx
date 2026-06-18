import { useEffect, useMemo, useState } from "react";
import { Save, X } from "lucide-react";

import AssigneePicker from "./AssigneePicker";
import Button from "./Button";
import DateTimePicker from "./DateTimePicker";
import SelectMenu from "./SelectMenu";
import TaskAttachmentField from "./TaskAttachmentField";
import TaskReminderFields from "./TaskReminderFields";
import { integrationsApi } from "../services/api";
import { formatDateTimeLocal, toIsoOrNull } from "../utils/formatters";
import { hasGoogleCalendarDateTime } from "../utils/googleCalendarTasks";
import { getReminderPayload, getReminderValidationError } from "../utils/taskReminders";
import { normalizeTaskForForm, priorityPoints } from "../utils/tasks";

export default function TaskEditorModal({ task, categories = [], members = [], onClose, onSave, saving = false, error = "" }) {
  const [form, setForm] = useState(() => normalizeTaskForForm(task));
  const [localError, setLocalError] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [syncGoogleCalendar, setSyncGoogleCalendar] = useState(false);

  useEffect(() => {
    setForm({
      ...normalizeTaskForForm(task),
      due_date: formatDateTimeLocal(task?.due_date)
    });
    setLocalError("");
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    setSyncGoogleCalendar(false);
  }, [task]);

  useEffect(() => {
    if (!task) return undefined;
    let alive = true;
    integrationsApi.googleCalendarStatus().then(
      (status) => {
        if (alive) setCalendarStatus(status);
      },
      () => {
        if (alive) setCalendarStatus(null);
      }
    );
    return () => {
      alive = false;
    };
  }, [task]);

  useEffect(() => {
    if (!calendarStatus?.can_sync || !hasGoogleCalendarDateTime(form.due_date)) {
      setSyncGoogleCalendar(false);
    }
  }, [calendarStatus?.can_sync, form.due_date]);

  useEffect(() => {
    if (!task) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving, task]);

  const selectedMembers = useMemo(() => {
    const selected = new Set(form.assignee_ids);
    return members.filter((member) => selected.has(member.user_id));
  }, [form.assignee_ids, members]);

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

  if (!task) return null;

  function updateField(field, value) {
    setLocalError("");
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
    setLocalError("");
    setForm((current) => ({ ...current, ...values }));
  }

  function removeExistingAttachment(attachmentId) {
    setLocalError("");
    setRemovedAttachmentIds((current) => (current.includes(attachmentId) ? current : [...current, attachmentId]));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const reminderError = getReminderValidationError(form);
    if (reminderError) {
      setLocalError(reminderError);
      return;
    }
    onSave?.(
      {
        title: form.title,
        description: form.description || null,
        assignee_ids: form.assignee_ids,
        assignee_id: form.assignee_ids[0] || null,
        category_id: form.category_id || null,
        due_date: toIsoOrNull(form.due_date),
        priority: form.priority,
        status: form.status,
        ...getReminderPayload(form)
      },
      {
        pendingFiles,
        removedAttachmentIds,
        syncGoogleCalendar
      }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/25 px-2 py-2 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[24px] border border-white/80 bg-white shadow-soft animate-in sm:max-h-[92vh] sm:rounded-[28px]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="section-title">Editar tarefa</p>
            <p className="mt-1 text-sm text-muted">Ajuste responsaveis, status, prioridade e prazo em um so lugar.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-ink">Nome</label>
                <input className="soft-input" value={form.title} onChange={(event) => updateField("title", event.target.value)} required />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-ink">Descricao</label>
                <textarea className="soft-input min-h-24 resize-none" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
              </div>

              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-semibold text-ink">Responsaveis</label>
                  <span className="text-xs font-semibold text-muted">{selectedMembers.length || 1} selecionado(s)</span>
                </div>
                <AssigneePicker members={members} value={form.assignee_ids} onChange={(value) => updateField("assignee_ids", value)} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">Categoria</label>
                <SelectMenu value={form.category_id} onChange={(value) => updateField("category_id", value)} options={categoryOptions} />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">Prioridade</label>
                <SelectMenu
                  value={form.priority}
                  onChange={(value) => updateField("priority", value)}
                  options={[
                    { value: "baixa", label: "Baixa", helper: `${priorityPoints.baixa} pontos` },
                    { value: "media", label: "Media", helper: `${priorityPoints.media} pontos` },
                    { value: "alta", label: "Alta", helper: `${priorityPoints.alta} pontos` }
                  ]}
                />
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
                    className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                    checked={syncGoogleCalendar}
                    onChange={(event) => setSyncGoogleCalendar(event.target.checked)}
                    disabled={!calendarStatus?.can_sync || !hasGoogleCalendarDateTime(form.due_date) || saving}
                  />
                  <span>
                    {task.google_calendar_event_id
                      ? "Atualizar o evento existente no Google Agenda ao salvar."
                      : "Tambem adicionar esta tarefa ao Google Agenda quando houver data e horario."}
                    {!calendarStatus?.can_sync
                      ? ` ${calendarStatus?.message || "Conecte o Google Agenda nas configuracoes."}`
                      : !hasGoogleCalendarDateTime(form.due_date)
                        ? " Defina data e horario para sincronizar."
                        : ""}
                  </span>
                </label>
              )}

              <TaskAttachmentField
                taskId={task.id}
                existingAttachments={task.attachments || []}
                removedAttachmentIds={removedAttachmentIds}
                pendingFiles={pendingFiles}
                onPendingFilesChange={setPendingFiles}
                onRemoveExisting={removeExistingAttachment}
                disabled={saving}
                onError={setLocalError}
              />

              <div>
                <label className="mb-2 block text-sm font-semibold text-ink">Status</label>
                <SelectMenu
                  value={form.status}
                  onChange={(value) => updateField("status", value)}
                  options={[
                    { value: "pendente", label: "Pendente", helper: "Aguardando acao" },
                    { value: "em_andamento", label: "Em andamento", helper: "Ja comecou" },
                    { value: "concluida", label: "Concluida", helper: "Pontua no ranking" },
                    { value: "atrasada", label: "Atrasada", helper: "Precisa de atencao" }
                  ]}
                />
              </div>
            </div>

            {(localError || error) && (
              <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
                {localError || error}
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 bg-white/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
              <Save className="h-5 w-5" />
              Salvar edicao
            </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

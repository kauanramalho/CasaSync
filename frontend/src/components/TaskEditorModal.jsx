import { useEffect, useMemo, useState } from "react";
import { Save, X } from "lucide-react";

import AssigneePicker from "./AssigneePicker";
import Button from "./Button";
import DateTimePicker from "./DateTimePicker";
import SelectMenu from "./SelectMenu";
import TaskReminderFields from "./TaskReminderFields";
import { formatDateTimeLocal, toIsoOrNull } from "../utils/formatters";
import { getReminderPayload, getReminderValidationError } from "../utils/taskReminders";
import { normalizeTaskForForm, priorityPoints } from "../utils/tasks";

export default function TaskEditorModal({ task, categories = [], members = [], onClose, onSave, saving = false, error = "" }) {
  const [form, setForm] = useState(() => normalizeTaskForForm(task));
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setForm({
      ...normalizeTaskForForm(task),
      due_date: formatDateTimeLocal(task?.due_date)
    });
    setLocalError("");
  }, [task]);

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
      }
      return next;
    });
  }

  function updateReminder(values) {
    setLocalError("");
    setForm((current) => ({ ...current, ...values }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const reminderError = getReminderValidationError(form);
    if (reminderError) {
      setLocalError(reminderError);
      return;
    }
    onSave?.({
      title: form.title,
      description: form.description || null,
      assignee_ids: form.assignee_ids,
      assignee_id: form.assignee_ids[0] || null,
      category_id: form.category_id || null,
      due_date: toIsoOrNull(form.due_date),
      priority: form.priority,
      status: form.status,
      ...getReminderPayload(form)
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/25 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-soft animate-in">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="section-title">Editar tarefa</p>
            <p className="mt-1 text-sm text-muted">Ajuste responsaveis, status, prioridade e prazo em um so lugar.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(92vh-84px)] overflow-y-auto px-6 py-5">
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

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-5 w-5" />
              Salvar edicao
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

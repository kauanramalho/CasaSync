import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Save, X } from "lucide-react";

import AssigneePicker from "./AssigneePicker";
import Button from "./Button";
import { formatDateTimeLocal, toIsoOrNull } from "../utils/formatters";
import { normalizeTaskForForm, priorityPoints } from "../utils/tasks";

export default function TaskEditorModal({ task, categories = [], members = [], onClose, onSave, saving = false }) {
  const [form, setForm] = useState(() => normalizeTaskForForm(task));

  useEffect(() => {
    setForm({
      ...normalizeTaskForForm(task),
      due_date: formatDateTimeLocal(task?.due_date)
    });
  }, [task]);

  const selectedMembers = useMemo(() => {
    const selected = new Set(form.assignee_ids);
    return members.filter((member) => selected.has(member.user_id));
  }, [form.assignee_ids, members]);

  if (!task) return null;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave?.({
      title: form.title,
      description: form.description || null,
      assignee_ids: form.assignee_ids,
      assignee_id: form.assignee_ids[0] || null,
      category_id: form.category_id || null,
      due_date: toIsoOrNull(form.due_date),
      priority: form.priority,
      status: form.status
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/25 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="section-title">Editar tarefa</p>
            <p className="mt-1 text-sm text-muted">Ajuste responsáveis, status, prioridade e prazo em um só lugar.</p>
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
              <label className="mb-2 block text-sm font-semibold text-ink">Descrição</label>
              <textarea className="soft-input min-h-24 resize-none" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
            </div>

            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-ink">Responsáveis</label>
                <span className="text-xs font-semibold text-muted">{selectedMembers.length || 1} selecionado(s)</span>
              </div>
              <AssigneePicker members={members} value={form.assignee_ids} onChange={(value) => updateField("assignee_ids", value)} />
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
              <label className="mb-2 block text-sm font-semibold text-ink">Prioridade</label>
              <select className="soft-input" value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
                <option value="baixa">Baixa · {priorityPoints.baixa} pontos</option>
                <option value="media">Média · {priorityPoints.media} pontos</option>
                <option value="alta">Alta · {priorityPoints.alta} pontos</option>
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
              <label className="mb-2 block text-sm font-semibold text-ink">Status</label>
              <select className="soft-input" value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="atrasada">Atrasada</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-5 w-5" />
              Salvar edição
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


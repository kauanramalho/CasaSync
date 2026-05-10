import { BellRing } from "lucide-react";

import SelectMenu from "./SelectMenu";
import {
  buildReminderValue,
  calculateReminderAt,
  formatReminderDateTime,
  parseReminderValue,
  reminderOptions
} from "../utils/taskReminders";

export default function TaskReminderFields({ form, onChange }) {
  const hasDueDate = Boolean(form.due_date);
  const reminderValue = buildReminderValue(form.reminder_value, form.reminder_unit);
  const enabled = Boolean(form.reminder_enabled && hasDueDate);
  const previewReminderAt = enabled ? calculateReminderAt(form.due_date, form.reminder_value, form.reminder_unit) : null;
  const persistedReminderAt = form.reminder_at ? new Date(form.reminder_at) : null;
  const displayReminderAt = previewReminderAt || persistedReminderAt;

  function updateReminderEnabled(nextEnabled) {
    if (!hasDueDate) {
      onChange({ reminder_enabled: false });
      return;
    }
    if (!nextEnabled) {
      onChange({ reminder_enabled: false, reminder_value: null, reminder_unit: null });
      return;
    }
    const reminder = parseReminderValue(reminderValue);
    onChange({ reminder_enabled: true, reminder_value: reminder.amount, reminder_unit: reminder.unit });
  }

  function updateReminderValue(nextValue) {
    const reminder = parseReminderValue(nextValue);
    onChange({ reminder_enabled: true, reminder_value: reminder.amount, reminder_unit: reminder.unit });
  }

  return (
    <div className="md:col-span-2 rounded-[22px] border border-blue-100 bg-gradient-to-br from-blue-50/80 to-rose-50/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-blue-600 shadow-card">
            <BellRing className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Me lembrar desta tarefa</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-muted">
              Voce recebera uma notificacao no CasaSync antes do prazo da tarefa.
            </p>
            {enabled && displayReminderAt && (
              <p className="mt-2 text-xs font-bold text-blue-600">
                Lembrete previsto para {formatReminderDateTime(displayReminderAt)}.
              </p>
            )}
            {!hasDueDate && <p className="mt-2 text-xs font-bold text-rose-600">Defina um prazo para ativar lembrete.</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateReminderEnabled(!enabled)}
          disabled={!hasDueDate}
          className={`relative h-7 w-12 rounded-full transition ${
            enabled ? "bg-blue-500" : "bg-slate-200"
          } ${!hasDueDate ? "cursor-not-allowed opacity-60" : "hover:shadow-card"}`}
          aria-pressed={enabled}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {enabled && (
        <div className="mt-4 max-w-xs">
          <label className="mb-2 block text-sm font-semibold text-ink">Quando lembrar?</label>
          <SelectMenu value={reminderValue} onChange={updateReminderValue} options={reminderOptions} />
        </div>
      )}
    </div>
  );
}

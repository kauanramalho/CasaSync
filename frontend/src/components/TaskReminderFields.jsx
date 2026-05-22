import { BellRing } from "lucide-react";

import {
  calculateReminderAt,
  formatReminderDateTime,
  formatReminderLead,
  normalizeReminderList,
  reminderKey,
  reminderOptions
} from "../utils/taskReminders";

export default function TaskReminderFields({ form, onChange }) {
  const hasDueDate = Boolean(form.due_date);
  const reminders = normalizeReminderList(form);
  const enabled = Boolean(reminders.length && hasDueDate);
  const selectedKeys = new Set(reminders.map(reminderKey));
  const previewReminders = enabled
    ? reminders
        .map((reminder) => ({
          ...reminder,
          reminderAt: calculateReminderAt(form.due_date, reminder.value, reminder.unit)
        }))
        .filter((reminder) => reminder.reminderAt)
    : [];
  const persistedReminderAt = !previewReminders.length && form.reminder_at ? new Date(form.reminder_at) : null;

  function emitReminders(nextReminders) {
    const first = nextReminders[0];
    onChange({
      reminders: nextReminders.map((reminder) => ({ value: reminder.value, unit: reminder.unit })),
      reminder_enabled: nextReminders.length > 0,
      reminder_value: first?.value ?? null,
      reminder_unit: first?.unit ?? null
    });
  }

  function updateReminderEnabled(nextEnabled) {
    if (!hasDueDate) {
      emitReminders([]);
      return;
    }
    if (!nextEnabled) {
      emitReminders([]);
      return;
    }
    emitReminders(reminders.length ? reminders : [{ value: 1, unit: "hours" }]);
  }

  function toggleReminder(option) {
    if (!hasDueDate) return;
    const currentKey = reminderKey(option);
    const nextReminders = selectedKeys.has(currentKey)
      ? reminders.filter((reminder) => reminderKey(reminder) !== currentKey)
      : [...reminders, { value: option.amount, unit: option.unit }];
    emitReminders(nextReminders);
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
            {enabled && previewReminders.length > 0 && (
              <div className="mt-2 space-y-1">
                {previewReminders.map((reminder) => (
                  <p key={`${reminder.value}-${reminder.unit}`} className="text-xs font-bold text-blue-600">
                    {formatReminderLead(reminder.value, reminder.unit)}: {formatReminderDateTime(reminder.reminderAt)}.
                  </p>
                ))}
              </div>
            )}
            {persistedReminderAt && (
              <p className="mt-2 text-xs font-bold text-blue-600">
                Lembrete previsto para {formatReminderDateTime(persistedReminderAt)}.
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
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-ink">Quando lembrar?</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {reminderOptions.map((option) => {
              const selected = selectedKeys.has(reminderKey(option));
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleReminder(option)}
                  className={`rounded-2xl border px-3 py-2 text-left text-xs font-bold transition ${
                    selected
                      ? "border-blue-200 bg-white text-blue-700 shadow-card"
                      : "border-white/80 bg-white/60 text-muted hover:border-blue-100 hover:text-blue-700"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

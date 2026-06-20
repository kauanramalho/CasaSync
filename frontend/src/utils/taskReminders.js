export const allowedReminderMinutes = [15, 30, 60, 180, 720, 1440, 4320];

const canonicalRemindersByMinutes = {
  15: { value: "15:minutes", label: "15 minutos antes", amount: 15, unit: "minutes" },
  30: { value: "30:minutes", label: "30 minutos antes", amount: 30, unit: "minutes" },
  60: { value: "1:hours", label: "1 hora antes", amount: 1, unit: "hours" },
  180: { value: "3:hours", label: "3 horas antes", amount: 3, unit: "hours" },
  720: { value: "12:hours", label: "12 horas antes", amount: 12, unit: "hours" },
  1440: { value: "1:days", label: "1 dia antes", amount: 1, unit: "days" },
  4320: { value: "3:days", label: "3 dias antes", amount: 3, unit: "days" }
};

export const reminderOptions = allowedReminderMinutes.map((minutes) => canonicalRemindersByMinutes[minutes]);

const unitLabels = {
  minutes: ["minuto", "minutos"],
  hours: ["hora", "horas"],
  days: ["dia", "dias"]
};

const reminderDurationsMs = {
  minutes: (value) => value * 60 * 1000,
  hours: (value) => value * 60 * 60 * 1000,
  days: (value) => value * 24 * 60 * 60 * 1000
};

export function formatReminderLead(value, unit) {
  const totalMinutes = reminderTotalMinutes(value, unit);
  return canonicalRemindersByMinutes[totalMinutes]?.label || "";
}

function reminderTotalMinutes(value, unit) {
  const multiplier = { minutes: 1, hours: 60, days: 24 * 60 }[unit];
  return multiplier ? Number(value) * multiplier : 0;
}

function canonicalReminder(value, unit) {
  const totalMinutes = reminderTotalMinutes(value, unit);
  const option = canonicalRemindersByMinutes[totalMinutes];
  if (!option) return null;
  return { value: option.amount, amount: option.amount, unit: option.unit };
}

export function reminderKey(reminder) {
  return String(reminderTotalMinutes(reminder?.amount ?? reminder?.value, reminder?.unit) || "");
}

export function normalizeReminderList(source = {}) {
  const rawReminders = Array.isArray(source.reminders) ? source.reminders : [];
  const normalized = [];
  const seenMinutes = new Set();

  for (const rawReminder of rawReminders) {
    const parsedValue = Number(rawReminder?.value ?? rawReminder?.amount ?? rawReminder?.reminder_value ?? rawReminder?.reminderValue);
    const unit = rawReminder?.unit ?? rawReminder?.reminder_unit ?? rawReminder?.reminderUnit;
    if (!parsedValue || !unitLabels[unit]) continue;
    const canonical = canonicalReminder(parsedValue, unit);
    if (!canonical) continue;
    const totalMinutes = reminderTotalMinutes(canonical.value, canonical.unit);
    if (!totalMinutes || seenMinutes.has(totalMinutes)) continue;
    seenMinutes.add(totalMinutes);
    normalized.push(canonical);
    if (normalized.length >= 5) break;
  }

  if (!normalized.length && source.reminder_enabled && source.reminder_value && source.reminder_unit) {
    return normalizeReminderList({ reminders: [{ value: source.reminder_value, unit: source.reminder_unit }] });
  }

  return normalized;
}

export function formatReminderList(reminders = []) {
  const normalized = normalizeReminderList({ reminders });
  if (!normalized.length) return "";
  return normalized.map((reminder) => formatReminderLead(reminder.value, reminder.unit)).join(", ");
}

export function calculateReminderAt(dueDate, value, unit) {
  if (!dueDate || !value || !reminderDurationsMs[unit]) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return new Date(due.getTime() - reminderDurationsMs[unit](Number(value)));
}

export function formatReminderDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function getReminderValidationError(form) {
  const reminders = normalizeReminderList(form);
  if (!reminders.length) return "";
  if (!form.due_date) return "Defina um prazo para ativar lembrete.";

  for (const reminder of reminders) {
    const reminderAt = calculateReminderAt(form.due_date, reminder.value, reminder.unit);
    if (!reminderAt) return "Escolha quando o lembrete deve acontecer.";
  }
  return "";
}

export function getReminderPayload(form) {
  const reminders = normalizeReminderList(form);
  if (!reminders.length) {
    return {
      reminder_enabled: false,
      reminder_value: null,
      reminder_unit: null,
      reminders: []
    };
  }

  const reminder = reminders[0];
  return {
    reminder_enabled: true,
    reminder_value: reminder.value,
    reminder_unit: reminder.unit,
    reminders: reminders.map((item) => ({ value: item.value, unit: item.unit }))
  };
}

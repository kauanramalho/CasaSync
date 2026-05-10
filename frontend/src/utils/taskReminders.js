export const reminderOptions = [
  { value: "15:minutes", label: "15 minutos antes", amount: 15, unit: "minutes" },
  { value: "30:minutes", label: "30 minutos antes", amount: 30, unit: "minutes" },
  { value: "1:hours", label: "1 hora antes", amount: 1, unit: "hours" },
  { value: "3:hours", label: "3 horas antes", amount: 3, unit: "hours" },
  { value: "12:hours", label: "12 horas antes", amount: 12, unit: "hours" },
  { value: "1:days", label: "1 dia antes", amount: 1, unit: "days" },
  { value: "3:days", label: "3 dias antes", amount: 3, unit: "days" }
];

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

export function buildReminderValue(value, unit) {
  return value && unit ? `${value}:${unit}` : reminderOptions[0].value;
}

export function parseReminderValue(value) {
  const [amount, unit] = String(value || "").split(":");
  const parsedAmount = Number(amount);
  if (!parsedAmount || !unitLabels[unit]) return reminderOptions[0];
  return { amount: parsedAmount, unit };
}

export function formatReminderLead(value, unit) {
  if (!value || !unitLabels[unit]) return "";
  const [singular, plural] = unitLabels[unit];
  return `${value} ${value === 1 ? singular : plural} antes`;
}

export function formatReminderMessageLead(value, unit) {
  if (!value || !unitLabels[unit]) return "";
  const [singular, plural] = unitLabels[unit];
  return `${value} ${value === 1 ? singular : plural}`;
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
  if (!form.reminder_enabled) return "";
  if (!form.due_date) return "Defina um prazo para ativar lembrete.";

  const reminder = parseReminderValue(buildReminderValue(form.reminder_value, form.reminder_unit));
  const reminderAt = calculateReminderAt(form.due_date, reminder.amount, reminder.unit);
  if (!reminderAt) return "Escolha quando o lembrete deve acontecer.";
  if (reminderAt.getTime() <= Date.now()) {
    return "Esse lembrete ja ficou no passado. Escolha um prazo maior ou uma antecedencia menor.";
  }
  return "";
}

export function getReminderPayload(form) {
  if (!form.reminder_enabled) {
    return {
      reminder_enabled: false,
      reminder_value: null,
      reminder_unit: null
    };
  }

  const reminder = parseReminderValue(buildReminderValue(form.reminder_value, form.reminder_unit));
  return {
    reminder_enabled: true,
    reminder_value: reminder.amount,
    reminder_unit: reminder.unit
  };
}

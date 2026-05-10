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

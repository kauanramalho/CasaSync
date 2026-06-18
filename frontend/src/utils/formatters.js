import { getStoredPreferences } from "./preferences.js";

export const priorityLabels = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta"
};

export const statusLabels = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  atrasada: "Atrasada"
};

export function toValidDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, fallback = "Sem prazo") {
  const date = toValidDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: getStoredPreferences().timezone
  }).format(date);
}

export function formatDateTimeLocal(value) {
  const date = toValidDate(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoOrNull(value) {
  return toValidDate(value)?.toISOString() ?? null;
}

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function normalizeApiError(error) {
  return error?.message || "Algo saiu do esperado.";
}

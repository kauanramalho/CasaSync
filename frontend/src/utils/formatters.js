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

export function formatDate(value, fallback = "Sem prazo") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
}

export function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
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

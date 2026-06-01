import { normalizeReminderList } from "./taskReminders";

export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const HIGH_CONFIDENCE_THRESHOLD = 0.75;

export const typeLabels = {
  task: "Tarefa",
  event: "Evento",
  reminder: "Lembrete"
};

export const priorityOptions = [
  { value: "low", label: "Baixa", helper: "Pode esperar um pouco" },
  { value: "medium", label: "Media", helper: "Importante para acompanhar" },
  { value: "high", label: "Alta", helper: "Precisa de atencao" },
  { value: "urgent", label: "Urgente", helper: "Resolver o quanto antes" }
];

export function createSuggestionId(index) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `suggestion-${Date.now()}-${index}`;
}

export function normalizeConfidence(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function formatPercent(value) {
  return `${Math.round(normalizeConfidence(value) * 100)}%`;
}

export function getConfidenceLabel(value) {
  const confidence = normalizeConfidence(value);
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return "Alta confianca";
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return "Media confianca";
  return "Baixa confianca";
}

export function formatSchedule(item) {
  const start = [item.date, item.time].filter(Boolean).join(" ");
  const end = [item.endDate, item.endTime].filter(Boolean).join(" ");
  if (start && end) return `${start} ate ${end}`;
  return start || "Sem data definida";
}

export function findCategoryId(categoryName, categories) {
  const normalized = String(categoryName || "").trim().toLowerCase();
  if (!normalized) return "";
  return categories.find((category) => category.name.trim().toLowerCase() === normalized)?.id || "";
}

function findValidCategoryId(rawItem, categories) {
  const existingIds = new Set(categories.map((category) => category.id));
  if (rawItem.categoryId && existingIds.has(rawItem.categoryId)) return rawItem.categoryId;
  return findCategoryId(rawItem.category, categories);
}

function findValidAssigneeIds(rawItem, members) {
  const memberIdToUserId = new Map();
  members.forEach((member) => {
    const userId = member.user_id || member.userId || member.user?.id;
    if (!userId) return;
    [userId, member.id].filter(Boolean).forEach((id) => memberIdToUserId.set(String(id), String(userId)));
  });
  const rawIds = Array.isArray(rawItem.assigneeIds) ? [...rawItem.assigneeIds] : [];
  if (rawItem.assigneeId) rawIds.push(rawItem.assigneeId);
  const normalizedRawIds = [...new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!normalizedRawIds.length) return [];
  if (!members.length) return normalizedRawIds;
  return [...new Set(normalizedRawIds.map((id) => memberIdToUserId.get(id)).filter(Boolean))];
}

export function buildReviewItem(rawItem = {}, index, categories = [], members = []) {
  const confidence = normalizeConfidence(rawItem.confidence);
  const categoryId = findValidCategoryId(rawItem, categories);
  const reminders = normalizeReminderList(rawItem).map((reminder) => ({ value: reminder.value, unit: reminder.unit }));
  const firstReminder = reminders[0] || null;
  const assigneeIds = findValidAssigneeIds(rawItem, members);
  const assigneeNames = Array.isArray(rawItem.resolvedAssigneeNames)
    ? rawItem.resolvedAssigneeNames
    : Array.isArray(rawItem.assigneeNames)
      ? rawItem.assigneeNames
      : [];
  return {
    source: {
      origin: "ai_image_import",
      rawSuggestionId: rawItem.suggestionId || null,
      rawType: rawItem.type || "task",
      rawTitle: rawItem.title || "",
      rawResponsible: rawItem.responsible || "",
      rawAssigneeText: rawItem.originalAssigneeText || "",
      sourceImageName: rawItem.sourceImageName || ""
    },
    suggestionId: rawItem.suggestionId || createSuggestionId(index),
    selected: true,
    type: rawItem.type || "task",
    title: rawItem.title || "",
    description: rawItem.description || "",
    date: rawItem.date || "",
    time: rawItem.time || "",
    endDate: rawItem.endDate || "",
    endTime: rawItem.endTime || "",
    category: rawItem.category || "",
    categoryId,
    priority: rawItem.priority || "medium",
    responsible: rawItem.responsible || "",
    assigneeIds,
    assigneeNames,
    resolvedAssigneeNames: assigneeNames,
    originalAssigneeText: rawItem.originalAssigneeText || rawItem.responsible || "",
    assigneeResolutionStatus: rawItem.assigneeResolutionStatus || (assigneeIds.length ? "resolved" : "unresolved"),
    assigneeResolutionWarnings: Array.isArray(rawItem.assigneeResolutionWarnings) ? rawItem.assigneeResolutionWarnings : [],
    confidence,
    warnings: Array.isArray(rawItem.warnings) ? rawItem.warnings : [],
    acceptedLowConfidence: confidence >= LOW_CONFIDENCE_THRESHOLD,
    reminders,
    reminderEnabled: Boolean(reminders.length && rawItem.date),
    reminderValue: firstReminder?.value || null,
    reminderUnit: firstReminder?.unit || null,
    sourceImageName: rawItem.sourceImageName || "",
    originalText: rawItem.originalText || "",
    needsReview: rawItem.needsReview !== false,
    googleCalendarSuggestion: Boolean(rawItem.googleCalendarSuggestion)
  };
}

export function getUncertainReviewWarnings(item) {
  const warnings = [];

  if (item.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push("Baixa confianca: confira todos os campos antes de confirmar.");
  }
  if (!String(item.date || "").trim()) {
    warnings.push("Data nao identificada. Voce pode criar sem data ou preencher manualmente.");
  }
  if (!String(item.time || "").trim()) {
    warnings.push("Horario nao identificado. A tarefa pode ficar sem horario definido.");
  }
  if (!item.categoryId) {
    warnings.push(
      item.category
        ? "Categoria sugerida nao corresponde a uma categoria existente; escolha uma categoria ou deixe em branco."
        : "Categoria nao identificada; escolha uma categoria se fizer sentido."
    );
  }
  if (!item.assigneeIds?.length) {
    warnings.push(
      item.assigneeResolutionStatus === "ambiguous"
        ? "Responsavel sugerido e ambiguo; confirme manualmente na lista de membros."
        : item.responsible || item.originalAssigneeText
        ? "Responsavel sugerido precisa ser confirmado na lista de membros."
        : "Responsavel nao identificado; se nenhum for escolhido, o backend usa o usuario atual."
    );
  }

  return warnings;
}

export function validateReviewItemsBeforeImport(items) {
  return items.reduce((errors, item) => {
    const title = String(item.title || "").trim();
    if (!title) {
      errors[item.suggestionId] = "Informe um titulo antes de criar esta tarefa.";
      return errors;
    }
    if (title.length < 2) {
      errors[item.suggestionId] = "O titulo precisa ter pelo menos 2 caracteres.";
      return errors;
    }
    if (item.confidence < LOW_CONFIDENCE_THRESHOLD && !item.acceptedLowConfidence) {
      errors[item.suggestionId] = "Confirme a revisao deste item de baixa confianca.";
    }
    return errors;
  }, {});
}

export function buildTaskImportPayload(items, { syncGoogleCalendar = false, autoCreate = false } = {}) {
  return {
    syncGoogleCalendar,
    autoCreate,
    items: items.map((item) => {
      const reminders = item.reminderEnabled
        ? normalizeReminderList(item).map((reminder) => ({ value: reminder.value, unit: reminder.unit }))
        : [];
      return {
        suggestionId: item.suggestionId,
        type: item.type,
        title: String(item.title || "").trim(),
        description: item.description || null,
        date: item.date || null,
        time: item.time || null,
        endDate: item.endDate || null,
        endTime: item.endTime || null,
        category: item.category || null,
        categoryId: item.categoryId || null,
        priority: item.priority || null,
        responsible: item.responsible || null,
        assigneeIds: item.assigneeIds,
        confidence: item.confidence,
        warnings: item.warnings,
        acceptedLowConfidence: item.acceptedLowConfidence,
        reminderEnabled: reminders.length > 0,
        reminderValue: reminders[0]?.value || null,
        reminderUnit: reminders[0]?.unit || null,
        reminders,
        sourceImageName: item.sourceImageName || null,
        originalText: item.originalText || null
      };
    })
  };
}

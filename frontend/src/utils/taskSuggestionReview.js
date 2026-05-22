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

export function buildReviewItem(rawItem = {}, index, categories = []) {
  const confidence = normalizeConfidence(rawItem.confidence);
  const categoryId = findCategoryId(rawItem.category, categories);
  const reminders = Array.isArray(rawItem.reminders)
    ? rawItem.reminders
        .map((reminder) => ({
          value: Number(reminder?.value ?? reminder?.reminderValue),
          unit: reminder?.unit ?? reminder?.reminderUnit
        }))
        .filter((reminder) => reminder.value && ["minutes", "hours", "days"].includes(reminder.unit))
        .slice(0, 5)
    : [];
  if (!reminders.length && rawItem.reminderEnabled && rawItem.reminderValue && rawItem.reminderUnit) {
    reminders.push({ value: rawItem.reminderValue, unit: rawItem.reminderUnit });
  }
  const firstReminder = reminders[0] || null;
  return {
    source: {
      origin: "ai_image_import",
      rawSuggestionId: rawItem.suggestionId || null,
      rawType: rawItem.type || "task",
      rawTitle: rawItem.title || "",
      rawResponsible: rawItem.responsible || "",
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
    assigneeIds: [],
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
      item.responsible
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
        ? item.reminders?.length
          ? item.reminders
          : [{ value: item.reminderValue || 1, unit: item.reminderUnit || "hours" }]
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

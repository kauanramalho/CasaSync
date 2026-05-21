export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const HIGH_CONFIDENCE_THRESHOLD = 0.75;

export const typeLabels = {
  task: "Tarefa",
  event: "Evento",
  reminder: "Lembrete"
};

export const priorityOptions = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" }
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
  return {
    source: {
      origin: "ai_image_import",
      rawSuggestionId: rawItem.suggestionId || null,
      rawType: rawItem.type || "task",
      rawTitle: rawItem.title || "",
      rawResponsible: rawItem.responsible || ""
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
    reminderEnabled: Boolean(rawItem.reminderEnabled && rawItem.reminderValue && rawItem.reminderUnit && rawItem.date),
    reminderValue: rawItem.reminderValue || null,
    reminderUnit: rawItem.reminderUnit || null
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

export function buildTaskImportPayload(items, { syncGoogleCalendar = false } = {}) {
  return {
    syncGoogleCalendar,
    items: items.map((item) => ({
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
      reminderEnabled: item.reminderEnabled,
      reminderValue: item.reminderEnabled ? item.reminderValue || 1 : null,
      reminderUnit: item.reminderEnabled ? item.reminderUnit || "hours" : null
    }))
  };
}

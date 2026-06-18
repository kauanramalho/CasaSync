import { normalizeReminderList } from "./taskReminders.js";

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

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.\-\s,&/+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function memberUserId(member) {
  return String(member?.user_id || member?.userId || member?.user?.id || member?.id || "").trim();
}

function memberProfile(member) {
  return member?.user || member || {};
}

function memberDisplayName(member) {
  return String(memberProfile(member).name || member?.name || "").trim();
}

function emailLocalPart(email) {
  const text = String(email || "");
  return text.includes("@") ? text.split("@", 1)[0] : "";
}

function firstName(name) {
  return normalizeLookupText(name).split(" ", 1)[0] || "";
}

function derivedNameAliases(name) {
  const tokens = new Set(normalizeLookupText(name).split(" "));
  return tokens.has("beatriz") ? ["bia"] : [];
}

function uniqueList(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildMemberOptions(members = []) {
  return members
    .map((member) => {
      const profile = memberProfile(member);
      const id = memberUserId(member);
      const name = memberDisplayName(member);
      const username = profile.username || member?.username || "";
      const email = profile.email || member?.email || "";
      const aliases = uniqueList([
        name,
        firstName(name),
        username,
        email,
        emailLocalPart(email)
      ]).map(normalizeLookupText).filter(Boolean);
      return { id, name, aliases, derivedAliases: derivedNameAliases(name) };
    })
    .filter((member) => member.id && member.name);
}

function textContainsAlias(text, alias) {
  const normalizedText = normalizeLookupText(text);
  const normalizedAlias = normalizeLookupText(alias);
  if (!normalizedText || !normalizedAlias) return false;
  return new RegExp(`(^|[\\s,.;/&+-])${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s,.;/&+-])`).test(normalizedText);
}

function levenshteinDistance(left, right, maxDistance) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maxDistance) return null;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMin = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const insertCost = current[rightIndex - 1] + 1;
      const deleteCost = previous[rightIndex] + 1;
      const replaceCost = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      const value = Math.min(insertCost, deleteCost, replaceCost);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return null;
    previous = current;
  }
  return previous[right.length] <= maxDistance ? previous[right.length] : null;
}

function maxFuzzyDistance(alias) {
  if (alias.length < 4) return 0;
  return alias.length <= 6 ? 1 : 2;
}

const assigneeStopWords = new Set([
  "a",
  "as",
  "com",
  "da",
  "de",
  "do",
  "e",
  "eh",
  "em",
  "imagem",
  "original",
  "para",
  "pra",
  "responsavel",
  "responsaveis",
  "sera",
  "serao",
  "sugestao"
]);

function candidateNameTokens(value) {
  return uniqueList((normalizeLookupText(value).match(/\b[a-z0-9_.-]{3,40}\b/g) || []).filter((token) => !assigneeStopWords.has(token))).slice(0, 20);
}

function splitNameCandidates(value) {
  return normalizeLookupText(value)
    .split(/\s+(?:e|and|com)\s+|[,/&+]+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

function extractAssigneeFragments(text, { requireExplicit }) {
  const normalized = normalizeLookupText(text);
  if (!normalized) return { fragments: [], hadSignal: false };
  const fragments = [];
  const responsibleRe = /\b(?:responsavel|responsaveis|responsabilidade|e para|eh para|e da|eh da|e do|eh do|para|pra|com)\b\s*[:=-]?\s*([a-z0-9_.\-\s,&/+]+)/g;
  const stopRe = /\b(?:categoria|data|horario|hora|local|prioridade|lembrete|google|agenda|descricao|observacao|obs|titulo)\b/;
  let match = responsibleRe.exec(normalized);
  while (match) {
    const fragment = String(match[1] || "")
      .split(stopRe, 1)[0]
      .replace(/^(?:sera|serao|vai ser|deve ser|ficara para|ficar para|ser|e|eh)\s+/, "")
      .trim();
    if (fragment) fragments.push(fragment);
    match = responsibleRe.exec(normalized);
  }
  if (fragments.length) return { fragments, hadSignal: true };
  const leadingMatch = normalized.match(
    /^(?:a\s+|o\s+)?([a-z0-9_.-]{2,40})\s+(?:precisa|deve|vai|tem que|fazer|lavar|pagar|comprar|limpar|levar|tirar|estudar|organizar|buscar|resolver|preparar)\b/
  );
  if (leadingMatch) return { fragments: [leadingMatch[1]], hadSignal: true };
  const cleaned = normalized
    .replace(/\b(?:sugestao original|sugestao|original)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return requireExplicit ? { fragments: [], hadSignal: false } : { fragments: [cleaned || normalized], hadSignal: true };
}

function resolveAssigneesFromFragment(fragment, memberOptions) {
  const ids = [];
  const warnings = [];
  const normalizedFragment = normalizeLookupText(fragment);
  if (!normalizedFragment || !memberOptions.length) return { ids, warnings, status: "unresolved", hadSignal: false };

  const firstNameMatches = new Map();
  memberOptions.forEach((member) => {
    uniqueList([firstName(member.name), ...member.derivedAliases]).forEach((alias) => {
      firstNameMatches.set(alias, [...(firstNameMatches.get(alias) || []), member]);
    });
  });

  splitNameCandidates(normalizedFragment).forEach((candidate) => {
    let candidateResolved = false;
    memberOptions.forEach((member) => {
      const shortAliases = new Set([firstName(member.name), ...member.derivedAliases]);
      const strongAliases = member.aliases.filter((alias) => !shortAliases.has(alias));
      if (strongAliases.some((alias) => textContainsAlias(candidate, alias))) {
        if (!ids.includes(member.id)) ids.push(member.id);
        candidateResolved = true;
      }
    });
    if (candidateResolved) return;

    const mentionedFirstNames = [...firstNameMatches.entries()].filter(([name]) => textContainsAlias(candidate, name));
    if (mentionedFirstNames.length) {
      mentionedFirstNames.forEach(([name, matches]) => {
        if (matches.length === 1) {
          if (!ids.includes(matches[0].id)) ids.push(matches[0].id);
        } else {
          warnings.push(`Responsavel '${name}' e ambiguo nesta familia; confirme manualmente.`);
        }
      });
      return;
    }

    const candidateFirstName = normalizeLookupText(candidate);
    const firstMatches = firstNameMatches.get(candidateFirstName) || [];
    if (firstMatches.length === 1) {
      if (!ids.includes(firstMatches[0].id)) ids.push(firstMatches[0].id);
      return;
    }
    if (firstMatches.length > 1) {
      warnings.push(`Responsavel '${candidateFirstName}' e ambiguo nesta familia; confirme manualmente.`);
      return;
    }

    const fuzzyMatches = [];
    candidateNameTokens(candidate).forEach((token) => {
      memberOptions.forEach((member) => {
        const fuzzyAliases = member.aliases.filter((alias) => alias.length >= 4 && alias === firstName(member.name));
        fuzzyAliases.forEach((alias) => {
          const distance = levenshteinDistance(token, alias, maxFuzzyDistance(alias));
          if (distance && distance <= maxFuzzyDistance(alias)) {
            fuzzyMatches.push({ distance, member });
          }
        });
      });
    });
    if (!fuzzyMatches.length) return;
    const bestDistance = Math.min(...fuzzyMatches.map((item) => item.distance));
    const bestMembers = uniqueList(fuzzyMatches.filter((item) => item.distance === bestDistance).map((item) => item.member.id));
    if (bestMembers.length === 1) {
      if (!ids.includes(bestMembers[0])) ids.push(bestMembers[0]);
    } else {
      warnings.push(`Responsavel parecido com '${candidate}' e ambiguo nesta familia; confirme manualmente.`);
    }
  });

  return {
    ids,
    warnings: uniqueList(warnings),
    hadSignal: true,
    status: ids.length ? "resolved" : warnings.length ? "ambiguous" : "not_found"
  };
}

function rawAssigneeTexts(rawItem = {}) {
  return uniqueList([
    rawItem.originalAssigneeText,
    rawItem.originalResponsibleText,
    rawItem.responsible,
    rawItem.suggestedResponsible,
    rawItem.assigneeName,
    rawItem.responsibleName,
    ...(Array.isArray(rawItem.assigneeNames) ? rawItem.assigneeNames : []),
    ...(Array.isArray(rawItem.responsibleNames) ? rawItem.responsibleNames : []),
    ...(Array.isArray(rawItem.suggestedResponsibles) ? rawItem.suggestedResponsibles : []),
    rawItem.source?.rawAssigneeText,
    rawItem.source?.rawResponsible
  ]);
}

function rawDetectedTexts(rawItem = {}) {
  return uniqueList([
    rawItem.originalText,
    rawItem.detectedText,
    rawItem.rawText,
    rawItem.description,
    rawItem.title
  ]);
}

function stripAssigneeWarnings(warnings = []) {
  return warnings.filter((warning) => {
    const normalized = normalizeLookupText(warning);
    return !normalized.includes("responsavel") && !normalized.includes("responsaveis");
  });
}

export function resolveSuggestionAssigneesFromMembers(rawItem = {}, members = [], currentUserId = null) {
  const memberOptions = buildMemberOptions(members);
  const memberIdToUserId = new Map();
  memberOptions.forEach((member) => memberIdToUserId.set(member.id, member.id));
  members.forEach((member) => {
    const userId = memberUserId(member);
    if (!userId) return;
    [userId, member.id, member.user?.id].filter(Boolean).forEach((id) => memberIdToUserId.set(String(id), String(userId)));
  });

  const rawIds = uniqueList([...(Array.isArray(rawItem.assigneeIds) ? rawItem.assigneeIds : []), rawItem.assigneeId]);
  const validRawIds = memberOptions.length ? uniqueList(rawIds.map((id) => memberIdToUserId.get(String(id))).filter(Boolean)) : rawIds;
  if (validRawIds.length) {
    const names = memberOptions.filter((member) => validRawIds.includes(member.id)).map((member) => member.name);
    return {
      assigneeIds: validRawIds,
      assigneeId: validRawIds[0] || null,
      assigneeNames: names,
      resolvedAssigneeNames: names,
      originalAssigneeText: rawItem.originalAssigneeText || rawItem.responsible || "",
      assigneeResolutionStatus: "resolved",
      assigneeResolutionWarnings: [],
      assigneeWarningsWereCleared: true
    };
  }

  if (!memberOptions.length) {
    return {
      assigneeIds: [],
      assigneeId: null,
      assigneeNames: [],
      resolvedAssigneeNames: [],
      originalAssigneeText: rawItem.originalAssigneeText || rawItem.responsible || "",
      assigneeResolutionStatus: rawItem.assigneeResolutionStatus || "unresolved",
      assigneeResolutionWarnings: Array.isArray(rawItem.assigneeResolutionWarnings) ? rawItem.assigneeResolutionWarnings : []
    };
  }

  const sources = [
    ...rawAssigneeTexts(rawItem).map((text) => ({ text, requireExplicit: false })),
    ...rawDetectedTexts(rawItem).map((text) => ({ text, requireExplicit: true }))
  ];

  for (const source of sources) {
    const normalizedSource = normalizeLookupText(source.text);
    if (/^(?:a\s+)?(?:ela|ele)\s+(?:precisa|deve|vai|tem que)\b/.test(normalizedSource)) {
      return {
        assigneeIds: [],
        assigneeId: null,
        assigneeNames: [],
        resolvedAssigneeNames: [],
        originalAssigneeText: rawItem.originalAssigneeText || source.text || "",
        assigneeResolutionStatus: "ambiguous",
        assigneeResolutionWarnings: ["O pronome usado para o responsavel e ambiguo; confirme manualmente."]
      };
    }
    const extracted = extractAssigneeFragments(source.text, { requireExplicit: source.requireExplicit });
    if (!extracted.hadSignal && /\b(?:eu|me lembra|lembra me|minha tarefa|para mim|pra mim)\b/.test(normalizedSource)) {
      const currentMember = memberOptions.find((member) => member.id === String(currentUserId || ""));
      if (currentMember) {
        return {
          assigneeIds: [currentMember.id],
          assigneeId: currentMember.id,
          assigneeNames: [currentMember.name],
          resolvedAssigneeNames: [currentMember.name],
          originalAssigneeText: rawItem.originalAssigneeText || source.text || "",
          assigneeResolutionStatus: "resolved",
          assigneeResolutionWarnings: [],
          assigneeWarningsWereCleared: true
        };
      }
    }
    const { fragments, hadSignal } = extracted;
    if (!hadSignal) continue;
    const ids = [];
    const warnings = [];
    fragments.forEach((fragment) => {
      const resolution = resolveAssigneesFromFragment(fragment, memberOptions);
      resolution.ids.forEach((id) => {
        if (!ids.includes(id)) ids.push(id);
      });
      warnings.push(...resolution.warnings);
    });
    const names = memberOptions.filter((member) => ids.includes(member.id)).map((member) => member.name);
    const status = ids.length ? "resolved" : warnings.length ? "ambiguous" : "not_found";
    if (import.meta.env?.DEV) {
      console.info("[CasaSync IA assignees]", {
        receivedIds: rawIds,
        resolvedIds: ids,
        status,
        memberIds: memberOptions.map((member) => member.id)
      });
    }
    return {
      assigneeIds: ids,
      assigneeId: ids[0] || null,
      assigneeNames: names,
      resolvedAssigneeNames: names,
      originalAssigneeText: rawItem.originalAssigneeText || source.text || rawItem.responsible || "",
      assigneeResolutionStatus: status,
      assigneeResolutionWarnings: ids.length ? [] : uniqueList(warnings.length ? warnings : ["Responsavel sugerido nao foi encontrado entre os membros da familia."]),
      assigneeWarningsWereCleared: ids.length
    };
  }

  return {
    assigneeIds: [],
    assigneeId: null,
    assigneeNames: [],
    resolvedAssigneeNames: [],
    originalAssigneeText: rawItem.originalAssigneeText || rawItem.responsible || "",
    assigneeResolutionStatus: rawItem.assigneeResolutionStatus || "unresolved",
    assigneeResolutionWarnings: Array.isArray(rawItem.assigneeResolutionWarnings) ? rawItem.assigneeResolutionWarnings : []
  };
}

function findValidCategoryId(rawItem, categories) {
  const existingIds = new Set(categories.map((category) => category.id));
  if (rawItem.categoryId && existingIds.has(rawItem.categoryId)) return rawItem.categoryId;
  return findCategoryId(rawItem.category, categories);
}

export function buildReviewItem(rawItem = {}, index, categories = [], members = [], currentUserId = null) {
  const confidence = normalizeConfidence(rawItem.confidence);
  const categoryId = findValidCategoryId(rawItem, categories);
  const reminders = normalizeReminderList(rawItem).map((reminder) => ({ value: reminder.value, unit: reminder.unit }));
  const firstReminder = reminders[0] || null;
  const assigneeResolution = resolveSuggestionAssigneesFromMembers(rawItem, members, currentUserId);
  const assigneeIds = assigneeResolution.assigneeIds;
  const assigneeNames = assigneeResolution.resolvedAssigneeNames?.length
    ? assigneeResolution.resolvedAssigneeNames
    : Array.isArray(rawItem.resolvedAssigneeNames)
      ? rawItem.resolvedAssigneeNames
      : Array.isArray(rawItem.assigneeNames)
        ? rawItem.assigneeNames
        : [];
  const warnings = Array.isArray(rawItem.warnings) ? rawItem.warnings : [];
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
    assigneeId: assigneeResolution.assigneeId,
    assigneeNames,
    resolvedAssigneeNames: assigneeNames,
    originalAssigneeText: assigneeResolution.originalAssigneeText || rawItem.originalAssigneeText || rawItem.responsible || "",
    assigneeResolutionStatus: assigneeResolution.assigneeResolutionStatus || (assigneeIds.length ? "resolved" : "unresolved"),
    assigneeResolutionWarnings: assigneeResolution.assigneeResolutionWarnings || [],
    assigneeTouched: false,
    confidence,
    warnings: assigneeResolution.assigneeWarningsWereCleared ? stripAssigneeWarnings(warnings) : warnings,
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

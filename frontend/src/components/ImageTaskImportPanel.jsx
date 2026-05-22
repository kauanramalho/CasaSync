import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileImage,
  ImagePlus,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  WandSparkles,
  XCircle
} from "lucide-react";

import AssigneePicker from "./AssigneePicker";
import Button from "./Button";
import Card from "./Card";
import DateTimePicker from "./DateTimePicker";
import SelectMenu from "./SelectMenu";
import { imageAnalysisApi, integrationsApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { formatFileSize, imageFileAccept, optimizeImageForAnalysis, validateImageDimensions, validateImageFile } from "../utils/files";
import { normalizeApiError } from "../utils/formatters";
import {
  LOW_CONFIDENCE_THRESHOLD,
  buildReviewItem,
  buildTaskImportPayload,
  formatPercent,
  formatSchedule,
  getConfidenceLabel,
  getUncertainReviewWarnings,
  priorityOptions,
  typeLabels,
  validateReviewItemsBeforeImport
} from "../utils/taskSuggestionReview";
import { useToast } from "../hooks/useToast";

function formatReminderSuggestion(value, unit) {
  const labels = { minutes: "minuto(s)", hours: "hora(s)", days: "dia(s)" };
  if (!value || !unit) return "1 hora antes";
  return `${value} ${labels[unit] || unit} antes`;
}

function mergeDateTime(date, time) {
  if (!date) return "";
  return `${date}T${time || "09:00"}`;
}

function splitDateTime(value) {
  if (!value) return { date: "", time: "" };
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function ToneBadge({ children, tone = "neutral" }) {
  const tones = {
    selected: "border-blush/20 bg-blush/10 text-blush",
    neutral: "border-slate-200 bg-slate-100 text-muted",
    success: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    info: "border-blue-100 bg-blue-50 text-blue-700"
  };
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

function SoftAlert({ children, tone = "warning" }) {
  const tones = {
    warning: "border-amber-100 bg-amber-50/80 text-amber-700",
    error: "border-rose-100 bg-rose-50/80 text-rose-700",
    success: "border-emerald-100 bg-emerald-50/80 text-emerald-700",
    info: "border-blue-100 bg-blue-50/80 text-blue-700"
  };
  return <p className={`rounded-2xl border px-3 py-2 text-xs font-bold leading-relaxed ${tones[tone] || tones.warning}`}>{children}</p>;
}

function FieldLabel({ children }) {
  return <span className="mb-1.5 block text-xs font-black uppercase text-muted">{children}</span>;
}

const maxImagesPerAnalysis = 10;

function createSelectedImage(file, previewUrl) {
  const baseId = `${file.name}-${file.size}-${file.lastModified}`;
  return {
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${baseId}-${Date.now()}`,
    dedupeKey: baseId,
    file,
    previewUrl,
    status: "ready",
    error: ""
  };
}

export default function ImageTaskImportPanel({ categories = [], members = [], onImported }) {
  const { showToast } = useToast();
  const inputRef = useRef(null);
  const selectedImagesRef = useRef([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [importReport, setImportReport] = useState(null);
  const [itemErrors, setItemErrors] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [syncGoogleCalendar, setSyncGoogleCalendar] = useState(false);
  const [calendarPreferenceTouched, setCalendarPreferenceTouched] = useState(false);
  const [autoCreateEnabled, setAutoCreateEnabled] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [customInstructionsDraft, setCustomInstructionsDraft] = useState("");
  const [instructionsMaxLength, setInstructionsMaxLength] = useState(1500);
  const [savingInstructions, setSavingInstructions] = useState(false);

  const selectedItems = useMemo(() => reviewItems.filter((item) => item.selected), [reviewItems]);
  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Sem categoria", helper: "Criar sem vinculo de categoria" },
      ...categories.map((category) => ({
        value: category.id,
        label: category.name,
        helper: category.description || "Categoria da familia",
        category
      }))
    ],
    [categories]
  );
  const hasLowConfidencePendingReview = selectedItems.some(
    (item) => item.confidence < LOW_CONFIDENCE_THRESHOLD && !item.acceptedLowConfidence
  );
  const selectedImageCount = selectedImages.length;
  const analyzeButtonLabel = autoCreateEnabled
    ? "Interpretar e criar automaticamente"
    : selectedImageCount > 1
      ? "Interpretar imagens com IA real"
      : "Interpretar imagem com IA real";
  const analyzingLabel = autoCreateEnabled
    ? "IA analisando e preparando criacao..."
    : selectedImageCount > 1
      ? "IA analisando imagens..."
      : "IA analisando imagem...";
  const pendingReviewCount = importReport?.pendingReview?.length || 0;
  const createdCount = importReport?.created?.length || 0;
  const calendarCreatedCount = importReport?.created?.filter((item) => item.googleCalendarEventId).length || 0;

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  const revokeImagePreviews = useCallback((images = selectedImagesRef.current) => {
    images.forEach((image) => {
      if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
    });
  }, []);

  useEffect(() => () => revokeImagePreviews(), [revokeImagePreviews]);

  useEffect(() => {
    let alive = true;

    async function loadPanelSettings() {
      const [calendarResult, preferencesResult] = await Promise.allSettled([
        integrationsApi.googleCalendarStatus(),
        imageAnalysisApi.getPreferences()
      ]);
      if (!alive) return;
      if (calendarResult.status === "fulfilled") setCalendarStatus(calendarResult.value);
      if (calendarResult.status === "rejected") setCalendarStatus(null);
      if (preferencesResult.status === "fulfilled") {
        const value = preferencesResult.value?.customInstructions || "";
        setCustomInstructions(value);
        setCustomInstructionsDraft(value);
        setInstructionsMaxLength(preferencesResult.value?.maxLength || 1500);
      }
    }

    loadPanelSettings();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!calendarStatus?.can_sync) setSyncGoogleCalendar(false);
  }, [calendarStatus?.can_sync]);

  const clearSelection = useCallback(() => {
    revokeImagePreviews();
    setSelectedImages([]);
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    setItemErrors({});
    setError("");
    setDragging(false);
    setSyncGoogleCalendar(false);
    setCalendarPreferenceTouched(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [revokeImagePreviews]);

  const acceptFiles = useCallback(
    async (nextFiles) => {
      const incomingFiles = Array.from(nextFiles || []);
      if (!incomingFiles.length) return;
      setError("");
      setAnalysis(null);
      setReviewItems([]);
      setImportReport(null);
      setItemErrors({});

      const acceptedImages = [];
      const rejectedMessages = [];
      const existingKeys = new Set(selectedImagesRef.current.map((image) => image.dedupeKey));
      let availableSlots = Math.max(0, maxImagesPerAnalysis - selectedImagesRef.current.length);
      if (!availableSlots) {
        const message = `Envie no maximo ${maxImagesPerAnalysis} imagens por vez.`;
        setError(message);
        showToast({ type: "error", message });
        return;
      }

      for (const nextFile of incomingFiles) {
        if (availableSlots <= 0) {
          rejectedMessages.push(`Limite de ${maxImagesPerAnalysis} imagens atingido.`);
          break;
        }
        const dedupeKey = `${nextFile.name}-${nextFile.size}-${nextFile.lastModified}`;
        if (existingKeys.has(dedupeKey)) {
          rejectedMessages.push(`${nextFile.name}: esta imagem ja esta na lista.`);
          continue;
        }
        const validationError = validateImageFile(nextFile);
        if (validationError) {
          rejectedMessages.push(`${nextFile.name}: ${validationError}`);
          continue;
        }

        try {
          const dimensionError = await validateImageDimensions(nextFile);
          if (dimensionError) {
            rejectedMessages.push(`${nextFile.name}: ${dimensionError}`);
            continue;
          }

          const objectUrl = URL.createObjectURL(nextFile);
          acceptedImages.push(createSelectedImage(nextFile, objectUrl));
          existingKeys.add(dedupeKey);
          availableSlots -= 1;
        } catch {
          rejectedMessages.push(`${nextFile.name}: Nao foi possivel carregar a imagem.`);
        }
      }

      if (acceptedImages.length) {
        setSelectedImages((current) => [...current, ...acceptedImages]);
      }
      if (rejectedMessages.length) {
        const message = rejectedMessages.slice(0, 3).join(" ");
        setError(message);
        showToast({ type: "error", message });
      } else if (acceptedImages.length) {
        showToast({
          type: "success",
          message: acceptedImages.length > 1 ? `${acceptedImages.length} imagens adicionadas.` : "Imagem adicionada."
        });
      }
      try {
        if (inputRef.current) inputRef.current.value = "";
      } catch {
        // no-op: clearing the input is best effort.
      }
    },
    [showToast]
  );

  function handleInputChange(event) {
    acceptFiles(event.target.files);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  }

  function removeSelectedImage(imageId) {
    setSelectedImages((current) => {
      const removed = current.find((image) => image.id === imageId);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.id !== imageId);
    });
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    setItemErrors({});
  }

  function updateImageStatus(imageId, patch) {
    setSelectedImages((current) => current.map((image) => (image.id === imageId ? { ...image, ...patch } : image)));
  }

  async function saveCustomInstructions() {
    setSavingInstructions(true);
    setError("");
    try {
      const response = await imageAnalysisApi.savePreferences({ customInstructions: customInstructionsDraft });
      const value = response.customInstructions || "";
      setCustomInstructions(value);
      setCustomInstructionsDraft(value);
      setInstructionsMaxLength(response.maxLength || instructionsMaxLength);
      showToast({ type: "success", message: "Instrucoes da IA salvas." });
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setSavingInstructions(false);
    }
  }

  async function clearCustomInstructions() {
    setSavingInstructions(true);
    setError("");
    try {
      const response = await imageAnalysisApi.clearPreferences();
      setCustomInstructions("");
      setCustomInstructionsDraft("");
      setInstructionsMaxLength(response.maxLength || instructionsMaxLength);
      showToast({ type: "success", message: "Instrucoes da IA restauradas para o padrao." });
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setSavingInstructions(false);
    }
  }

  function updateReviewItem(suggestionId, patch) {
    setReviewItems((current) => current.map((item) => (item.suggestionId === suggestionId ? { ...item, ...patch } : item)));
    setItemErrors((current) => {
      if (!current[suggestionId]) return current;
      const next = { ...current };
      delete next[suggestionId];
      return next;
    });
  }

  function updateReviewDateTime(suggestionId, value) {
    const next = splitDateTime(value);
    updateReviewItem(suggestionId, {
      date: next.date,
      time: next.time,
      ...(!next.date ? { reminderEnabled: false } : {})
    });
  }

  function removeReviewItem(suggestionId) {
    setReviewItems((current) => current.filter((item) => item.suggestionId !== suggestionId));
    setItemErrors((current) => {
      if (!current[suggestionId]) return current;
      const next = { ...current };
      delete next[suggestionId];
      return next;
    });
  }

  function cancelReview() {
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    setItemErrors({});
    setError("");
  }

  async function handleAnalyze() {
    if (!selectedImages.length) return;
    setAnalyzing(true);
    setError("");
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    setItemErrors({});
    try {
      const optimizedFiles = [];
      for (const image of selectedImages) {
        updateImageStatus(image.id, { status: "processing", error: "" });
        try {
          const optimizedFile = await optimizeImageForAnalysis(image.file);
          optimizedFiles.push(optimizedFile);
          updateImageStatus(image.id, { status: "ready", error: "" });
        } catch (err) {
          const message = normalizeApiError(err) || err?.message || "Nao foi possivel otimizar esta imagem.";
          updateImageStatus(image.id, { status: "error", error: message });
        }
      }

      if (!optimizedFiles.length) {
        throw new Error("Nenhuma imagem valida ficou pronta para analise.");
      }

      const response = await imageAnalysisApi.analyzeTaskSuggestions(optimizedFiles);
      const nextReviewItems = (response.items || []).map((item, index) => buildReviewItem(item, index, categories));
      const hasGoogleSuggestion = nextReviewItems.some((item) => item.googleCalendarSuggestion && item.date && item.time);
      const shouldSyncGoogleCalendar = Boolean(
        calendarStatus?.can_sync && (syncGoogleCalendar || (!calendarPreferenceTouched && hasGoogleSuggestion))
      );
      setAnalysis(response);
      setReviewItems(nextReviewItems);
      if (hasGoogleSuggestion && calendarStatus?.can_sync && !calendarPreferenceTouched) {
        setSyncGoogleCalendar(true);
      }
      if (response.imageErrors?.length) {
        setSelectedImages((current) =>
          current.map((image) => {
            const error = response.imageErrors.find((item) => item.filename && image.file.name.includes(String(item.filename).replace("-ia-casasync.webp", "")));
            return error ? { ...image, status: "error", error: error.reason } : { ...image, status: "done", error: "" };
          })
        );
      } else {
        setSelectedImages((current) => current.map((image) => ({ ...image, status: "done", error: "" })));
      }
      showToast({
        type: response.items?.length ? "success" : "info",
        message: response.items?.length
          ? `${response.items.length} sugestao(oes) gerada(s) com IA real.`
          : "Nenhuma tarefa encontrada nas imagens."
      });

      if (autoCreateEnabled && nextReviewItems.length) {
        setImporting(true);
        const report = await tasksApi.importSuggestions(
          buildTaskImportPayload(nextReviewItems, { syncGoogleCalendar: shouldSyncGoogleCalendar, autoCreate: true })
        );
        setImportReport(report);
        const blockedIds = new Set([...(report.pendingReview || []), ...(report.failed || [])].map((item) => item.suggestionId));
        const pendingItems = nextReviewItems.filter((item) => blockedIds.has(item.suggestionId));
        setReviewItems(pendingItems);
        setItemErrors(
          [...(report.pendingReview || []), ...(report.failed || [])].reduce((errors, item) => {
            errors[item.suggestionId] = item.reason;
            return errors;
          }, {})
        );
        if (report.created?.length) {
          emitAppDataChanged();
          onImported?.(report);
        }
        showToast({
          type: report.created?.length ? "success" : "info",
          message: report.created?.length
            ? `${report.created.length} tarefa(s) criada(s) automaticamente.`
            : "Nenhuma sugestao foi criada automaticamente; revise os itens pendentes."
        });
      }
    } catch (err) {
      const message = normalizeApiError(err) || "Erro ao interpretar imagem.";
      setError(message);
      showToast({ type: "error", message });
      setSelectedImages((current) => current.map((image) => (image.status === "processing" ? { ...image, status: "ready" } : image)));
    } finally {
      setAnalyzing(false);
      setImporting(false);
    }
  }

  async function handleImportSuggestions() {
    setError("");
    setImportReport(null);
    setItemErrors({});

    if (!selectedItems.length) {
      const message = "Selecione pelo menos uma sugestao revisada.";
      setError(message);
      showToast({ type: "error", message });
      return;
    }

    const validationErrors = validateReviewItemsBeforeImport(selectedItems);
    if (Object.keys(validationErrors).length) {
      const message = "Corrija os itens destacados antes de criar tarefas.";
      setItemErrors(validationErrors);
      setError(message);
      showToast({ type: "error", message });
      return;
    }

    setImporting(true);
    try {
      const report = await tasksApi.importSuggestions(
        buildTaskImportPayload(selectedItems, { syncGoogleCalendar: Boolean(syncGoogleCalendar && calendarStatus?.can_sync) })
      );
      setImportReport(report);
      if (report.created?.length) {
        emitAppDataChanged();
        onImported?.(report);
      }
      showToast({
        type: report.created?.length ? "success" : "error",
        message: report.created?.length
          ? `${report.created.length} tarefa(s) criada(s) a partir das sugestoes.`
          : "Nenhuma sugestao foi criada. Revise os avisos."
      });
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="mx-auto mb-6 max-w-5xl overflow-visible border border-white/80 bg-gradient-to-br from-white/95 via-white/85 to-lavender/10">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blush/15 bg-blush/10 px-3 py-1 text-xs font-black uppercase text-blush shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Importar por imagem
          </div>
          <h2 className="text-xl font-black text-ink">Criar sugestoes por imagem</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-muted">
            A OpenAI interpreta a imagem no backend. Revise e confirme antes de transformar sugestoes em tarefas reais.
          </p>
        </div>
        {analysis?.needsUserReview && (
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 shadow-sm">
            <AlertTriangle className="h-4 w-4" />
            Revisao obrigatoria
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`min-h-72 rounded-[28px] border border-dashed p-4 shadow-sm transition ${
            dragging ? "border-blush bg-blush/10 ring-4 ring-blush/10" : "border-slate-200 bg-white/75"
          }`}
        >
          {selectedImages.length ? (
            <div className="flex h-full min-h-64 flex-col">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <ToneBadge tone="selected">{selectedImages.length} imagem(ns) selecionada(s)</ToneBadge>
                <ToneBadge tone="info">Limite {maxImagesPerAnalysis}</ToneBadge>
              </div>
              <div className="grid max-h-[32rem] gap-3 overflow-y-auto pr-1">
                {selectedImages.map((image, index) => (
                  <div key={image.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] border border-white/80 bg-white/85 p-2 shadow-sm">
                    <div className="h-16 w-[72px] overflow-hidden rounded-2xl border border-slate-100 bg-slate-100">
                      <img src={image.previewUrl} alt={`Preview da imagem ${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-ink">{image.file.name}</p>
                      <p className="mt-1 text-xs font-semibold text-muted">{formatFileSize(image.file.size)}</p>
                      {image.status === "processing" && <p className="mt-1 text-xs font-black text-blue-700">Processando...</p>}
                      {image.status === "done" && <p className="mt-1 text-xs font-black text-emerald-700">Processada</p>}
                      {image.error && <p className="mt-1 text-xs font-bold text-rose-700">{image.error}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSelectedImage(image.id)}
                      disabled={analyzing || importing}
                      className="grid h-9 w-9 place-items-center rounded-full border border-rose-100 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:opacity-60"
                      aria-label={`Remover ${image.file.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={() => inputRef.current?.click()} disabled={analyzing || importing}>
                  <RefreshCw className="h-4 w-4" />
                  Adicionar imagens
                </Button>
                <Button type="button" variant="danger" className="w-full sm:flex-1" onClick={clearSelection} disabled={analyzing || importing}>
                  <Trash2 className="h-4 w-4" />
                  Remover todas
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-full min-h-64 w-full flex-col items-center justify-center rounded-[22px] bg-white/80 px-4 py-8 text-center transition hover:bg-blush/5"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blush/10 text-blush">
                <UploadCloud className="h-7 w-7" />
              </span>
              <span className="mt-4 text-base font-black text-ink">Selecionar ou arrastar imagem</span>
              <span className="mt-2 text-sm font-semibold text-muted">PNG, JPG, JPEG ou WEBP ate 8 MB.</span>
            </button>
          )}

          <input ref={inputRef} type="file" accept={imageFileAccept} multiple className="hidden" onChange={handleInputChange} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <FileImage className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-ink">
                  {selectedImages.length ? `${selectedImages.length} imagem(ns) pronta(s) para analise` : "Nenhuma imagem selecionada"}
                </p>
                <p className="mt-1 text-xs font-semibold text-muted">
                  {selectedImages.length
                    ? `Total selecionado: ${formatFileSize(selectedImages.reduce((total, image) => total + image.file.size, 0))}`
                    : "A analise usa um adapter isolado e nao salva as imagens."}
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4">
                <SoftAlert tone="error">{error}</SoftAlert>
              </div>
            )}

            <div className="mt-4 rounded-[22px] border border-violet-100 bg-violet-50/50 p-3">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white text-blush shadow-sm">
                  <WandSparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-ink">Instrucoes personalizadas da IA</p>
                  <p className="mt-1 text-xs font-semibold text-muted">
                    Elas orientam lembretes, categoria, prioridade, descricao e Google Agenda, mas as regras de seguranca do CasaSync continuam acima delas.
                  </p>
                </div>
              </div>
              <textarea
                className="soft-input mt-3 min-h-24 resize-none bg-white/90 text-sm"
                value={customInstructionsDraft}
                maxLength={instructionsMaxLength}
                onChange={(event) => setCustomInstructionsDraft(event.target.value)}
                placeholder="Ex.: sempre sugerir lembrete 1 hora antes e adicionar ao Google Agenda quando houver data e horario."
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-bold text-muted">
                  {customInstructionsDraft.length}/{instructionsMaxLength} caracteres
                  {customInstructions ? " - instrucoes salvas ativas" : " - usando padrao"}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={clearCustomInstructions}
                    disabled={savingInstructions || (!customInstructions && !customInstructionsDraft)}
                  >
                    Limpar
                  </Button>
                  <Button
                    type="button"
                    className="px-3 py-2 text-xs"
                    onClick={saveCustomInstructions}
                    disabled={savingInstructions || customInstructionsDraft.length > instructionsMaxLength}
                  >
                    {savingInstructions ? "Salvando..." : "Salvar instrucoes"}
                  </Button>
                </div>
              </div>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/75 px-3 py-3 text-xs font-bold text-amber-700">
              <input
                type="checkbox"
                className="mt-0.5 accent-amber-600"
                checked={autoCreateEnabled}
                onChange={(event) => setAutoCreateEnabled(event.target.checked)}
                disabled={analyzing || importing}
              />
              <span>
                Confiar na IA e criar automaticamente. Tarefas com baixa confianca, dados incompletos ou risco de erro ainda ficam para revisao.
              </span>
            </label>

            {calendarStatus?.is_enabled && (
              <label
                className={`mt-3 flex items-start gap-3 rounded-2xl border px-3 py-3 text-xs font-bold ${
                  calendarStatus?.can_sync ? "border-blue-100 bg-blue-50/70 text-blue-700" : "border-slate-200 bg-slate-100 text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-blue-600"
                  checked={syncGoogleCalendar}
                  onChange={(event) => {
                    setCalendarPreferenceTouched(true);
                    setSyncGoogleCalendar(event.target.checked);
                  }}
                  disabled={!calendarStatus?.can_sync || analyzing || importing}
                />
                <span>
                  Tambem adicionar tarefas criadas ao Google Agenda quando houver data e horario.
                  {!calendarStatus?.can_sync ? ` ${calendarStatus?.message || "Conecte o Google Agenda nas configuracoes."}` : ""}
                </span>
              </label>
            )}

            <Button type="button" className="mt-4 w-full" onClick={handleAnalyze} disabled={!selectedImages.length || analyzing || importing}>
              {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {importing && autoCreateEnabled ? "Criando automaticamente..." : analyzing ? analyzingLabel : analyzeButtonLabel}
            </Button>
          </div>

          {analysis && (
            <div className="rounded-[26px] border border-white/80 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-black text-ink">Sugestoes geradas</h3>
                  <p className="mt-1 text-xs font-bold text-muted">
                    {selectedItems.length} de {reviewItems.length} sugestao(oes) selecionada(s) para criacao.
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {analysis.totalImagesProcessed > 1 ? "Imagens interpretadas" : "Imagem interpretada"} com IA real - {formatPercent(analysis.overallConfidence)}
                </span>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <ToneBadge tone="info">{analysis.totalImagesProcessed || selectedImages.length} imagem(ns) processada(s)</ToneBadge>
                <ToneBadge tone="success">{analysis.totalSuggestionsGenerated ?? reviewItems.length} sugestao(oes) encontrada(s)</ToneBadge>
              </div>

              {analysis.warnings?.length > 0 && (
                <div className="mb-4 space-y-2">
                  {analysis.warnings.map((warning) => (
                    <SoftAlert key={warning}>{warning}</SoftAlert>
                  ))}
                </div>
              )}

              {analysis.imageErrors?.length > 0 && (
                <div className="mb-4 space-y-2">
                  {analysis.imageErrors.map((item) => (
                    <SoftAlert key={`${item.filename || "imagem"}-${item.reason}`} tone="error">
                      {item.filename || "Imagem"}: {item.reason}
                    </SoftAlert>
                  ))}
                </div>
              )}

              {reviewItems.length === 0 && (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center shadow-sm">
                  <p className="text-sm font-black text-ink">Nenhuma sugestao encontrada.</p>
                  <p className="mt-2 text-sm font-semibold text-muted">Tente uma imagem mais nitida ou cadastre a tarefa manualmente.</p>
                </div>
              )}

              <div className="space-y-4">
                {reviewItems.map((item, index) => {
                  const uncertainWarnings = getUncertainReviewWarnings(item);
                  return (
                    <article
                      key={item.suggestionId}
                      className={`overflow-visible rounded-[26px] border bg-gradient-to-br from-white via-white to-lavender/10 p-4 shadow-card transition ${
                        itemErrors[item.suggestionId] ? "border-rose-200 ring-4 ring-rose-100" : "border-white/80 hover:shadow-soft"
                      }`}
                    >
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateReviewItem(item.suggestionId, { selected: !item.selected })}
                          className={`inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-black transition ${
                            item.selected
                              ? "border-blush/20 bg-blush/10 text-blush shadow-sm"
                              : "border-slate-200 bg-slate-100 text-muted hover:bg-white"
                          }`}
                        >
                          {item.selected ? "Selecionada" : "Ignorada"}
                        </button>
                        <ToneBadge>{typeLabels[item.type] || item.type}</ToneBadge>
                        <ToneBadge tone={item.confidence < LOW_CONFIDENCE_THRESHOLD ? "warning" : "success"}>
                          {getConfidenceLabel(item.confidence)} - {formatPercent(item.confidence)}
                        </ToneBadge>
                        {item.sourceImageName && <ToneBadge tone="info">{item.sourceImageName}</ToneBadge>}
                        <Button
                          type="button"
                          variant="ghost"
                          className="ml-auto px-3 py-1.5 text-xs"
                          onClick={() => removeReviewItem(item.suggestionId)}
                          disabled={importing}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover sugestao
                        </Button>
                      </div>

                      <div className="grid gap-4">
                        <label className="block">
                          <FieldLabel>Titulo</FieldLabel>
                          <input
                            className="soft-input bg-white/90 text-base font-bold"
                            value={item.title}
                            aria-invalid={Boolean(itemErrors[item.suggestionId])}
                            onChange={(event) => updateReviewItem(item.suggestionId, { title: event.target.value })}
                          />
                          {itemErrors[item.suggestionId] && (
                            <div className="mt-2">
                              <SoftAlert tone="error">{itemErrors[item.suggestionId]}</SoftAlert>
                            </div>
                          )}
                        </label>
                        <label className="block">
                          <FieldLabel>Descricao</FieldLabel>
                          <textarea
                            className="soft-input min-h-24 resize-none bg-white/90 leading-relaxed"
                            value={item.description}
                            onChange={(event) => updateReviewItem(item.suggestionId, { description: event.target.value })}
                          />
                        </label>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="block">
                            <FieldLabel>Data e horario</FieldLabel>
                            <DateTimePicker
                              value={mergeDateTime(item.date, item.time)}
                              onChange={(value) => updateReviewDateTime(item.suggestionId, value)}
                              placeholder="Escolher data e horario"
                            />
                            {item.date && !item.time && (
                              <div className="mt-2">
                                <SoftAlert tone="info">Horario nao identificado pela IA; ajuste antes de criar se necessario.</SoftAlert>
                              </div>
                            )}
                          </div>
                          <div className="block">
                            <FieldLabel>Prioridade</FieldLabel>
                            <SelectMenu
                              value={item.priority}
                              options={priorityOptions}
                              onChange={(value) => updateReviewItem(item.suggestionId, { priority: value })}
                              placeholder="Escolher prioridade"
                            />
                          </div>
                          <div className="block md:col-span-2">
                            <FieldLabel>Categoria</FieldLabel>
                            <SelectMenu
                              value={item.categoryId}
                              options={categoryOptions}
                              onChange={(value) => {
                                const category = categories.find((candidate) => candidate.id === value);
                                updateReviewItem(item.suggestionId, {
                                  categoryId: value,
                                  category: category?.name || ""
                                });
                              }}
                              placeholder="Escolher categoria"
                            />
                          </div>
                        </div>

                        <div>
                          <FieldLabel>Responsaveis</FieldLabel>
                          <AssigneePicker members={members} value={item.assigneeIds} onChange={(assigneeIds) => updateReviewItem(item.suggestionId, { assigneeIds })} />
                          {item.responsible && (
                            <p className="mt-2 rounded-2xl border border-slate-100 bg-white/70 px-3 py-2 text-xs font-bold text-muted">
                              Sugestao original: {item.responsible}
                            </p>
                          )}
                        </div>

                        <label className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs font-bold text-blue-700">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-blue-600"
                            checked={item.reminderEnabled}
                            onChange={(event) => updateReviewItem(item.suggestionId, { reminderEnabled: event.target.checked })}
                            disabled={!item.date}
                          />
                          <span>
                            Ativar lembrete {formatReminderSuggestion(item.reminderValue, item.reminderUnit)} quando houver data.
                          </span>
                        </label>

                        {item.confidence < LOW_CONFIDENCE_THRESHOLD && (
                          <label className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                            <input
                              type="checkbox"
                              className="mt-0.5 accent-amber-600"
                              checked={item.acceptedLowConfidence}
                              onChange={(event) => updateReviewItem(item.suggestionId, { acceptedLowConfidence: event.target.checked })}
                            />
                            <span>Revisei este item de baixa confianca e confirmo que ele pode ser criado.</span>
                          </label>
                        )}

                        <p className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 text-xs font-bold text-muted shadow-sm">
                          <CalendarDays className="h-4 w-4 text-blush" />
                          {formatSchedule(item)}
                        </p>

                        {uncertainWarnings.length > 0 && (
                          <div className="space-y-2">
                            {uncertainWarnings.map((warning) => (
                              <SoftAlert key={`${item.suggestionId}-review-${warning}`}>{warning}</SoftAlert>
                            ))}
                          </div>
                        )}

                        {item.warnings?.length > 0 && (
                          <div className="space-y-2">
                            {item.warnings.map((warning) => (
                              <SoftAlert key={`${item.suggestionId}-${warning}`}>{warning}</SoftAlert>
                            ))}
                          </div>
                        )}

                        {item.originalText && (
                          <div className="rounded-2xl border border-slate-100 bg-white/70 px-3 py-2 text-xs font-bold text-muted">
                            Texto identificado: {item.originalText}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                        {item.sourceImageName && <ToneBadge>{item.sourceImageName}</ToneBadge>}
                        <ToneBadge tone="info">Sugestao {index + 1}</ToneBadge>
                      </div>
                    </article>
                  );
                })}
              </div>

              {hasLowConfidencePendingReview && (
                <div className="mt-4">
                  <SoftAlert>Ha sugestoes de baixa confianca selecionadas. Marque a confirmacao de revisao nelas antes de criar.</SoftAlert>
                </div>
              )}

              {calendarStatus?.is_enabled && (
                <label
                  className={`mt-4 flex items-start gap-3 rounded-2xl border px-3 py-3 text-xs font-bold ${
                    calendarStatus?.can_sync ? "border-blue-100 bg-blue-50/70 text-blue-700" : "border-slate-200 bg-slate-100 text-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-blue-600"
                    checked={syncGoogleCalendar}
                    onChange={(event) => {
                      setCalendarPreferenceTouched(true);
                      setSyncGoogleCalendar(event.target.checked);
                    }}
                    disabled={!calendarStatus?.can_sync || importing}
                  />
                  <span>
                    Tambem adicionar tarefas criadas ao Google Agenda.
                    {!calendarStatus?.can_sync ? ` ${calendarStatus?.message || "Conecte o Google Agenda nas configuracoes."}` : ""}
                  </span>
                </label>
              )}

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={cancelReview} disabled={importing}>
                  Cancelar
                </Button>
                <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={() => inputRef.current?.click()} disabled={importing}>
                  <RefreshCw className="h-4 w-4" />
                  Adicionar/trocar imagens
                </Button>
                <Button type="button" className="w-full sm:flex-[1.5]" onClick={handleImportSuggestions} disabled={importing || !selectedItems.length}>
                  {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  {importing ? "Criando tarefas" : `Criar ${selectedItems.length} tarefa(s) selecionada(s)`}
                </Button>
              </div>
            </div>
          )}

          {importReport && (
            <div className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-sm">
              <h3 className="mb-3 text-base font-black text-ink">Resultado da importacao</h3>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <p className="text-xs font-black text-emerald-700">{createdCount} tarefa(s) criada(s)</p>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
                  <p className="text-xs font-black text-blue-700">{calendarCreatedCount} evento(s) no Google Agenda</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-black text-amber-700">{pendingReviewCount} sugestao(oes) para revisao</p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2">
                  <p className="text-xs font-black text-rose-700">{importReport.failed?.length || 0} falha(s)</p>
                </div>
              </div>
              <div className="space-y-2">
                {importReport.created?.map((item) => (
                  <p key={item.taskId} className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {item.title} foi criada.{item.googleCalendarMessage ? ` ${item.googleCalendarMessage}` : ""}
                  </p>
                ))}
                {importReport.failed?.map((item) => (
                  <p key={`${item.suggestionId}-${item.reason}`} className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {item.title}: {item.reason}
                  </p>
                ))}
                {importReport.ignored?.map((item) => (
                  <p key={`${item.suggestionId}-${item.reason}`} className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-muted">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {item.title}: {item.reason}
                  </p>
                ))}
                {importReport.pendingReview?.map((item) => (
                  <p key={`${item.suggestionId}-${item.reason}`} className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {item.title}: {item.reason}
                  </p>
                ))}
                {importReport.warnings?.map((warning) => (
                  <SoftAlert key={warning}>{warning}</SoftAlert>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

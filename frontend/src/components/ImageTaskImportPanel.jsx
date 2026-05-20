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
  XCircle
} from "lucide-react";

import AssigneePicker from "./AssigneePicker";
import Button from "./Button";
import Card from "./Card";
import { imageAnalysisApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { imageFileAccept, validateImageDimensions, validateImageFile } from "../utils/files";
import { normalizeApiError } from "../utils/formatters";
import { useToast } from "../hooks/useToast";

const LOW_CONFIDENCE_THRESHOLD = 0.5;

const typeLabels = {
  task: "Tarefa",
  event: "Evento",
  reminder: "Lembrete"
};

const priorityOptions = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" }
];

function createSuggestionId(index) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `suggestion-${Date.now()}-${index}`;
}

function formatPercent(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

function formatSchedule(item) {
  const start = [item.date, item.time].filter(Boolean).join(" ");
  const end = [item.endDate, item.endTime].filter(Boolean).join(" ");
  if (start && end) return `${start} ate ${end}`;
  return start || "Sem data definida";
}

function findCategoryId(categoryName, categories) {
  const normalized = String(categoryName || "").trim().toLowerCase();
  if (!normalized) return "";
  return categories.find((category) => category.name.trim().toLowerCase() === normalized)?.id || "";
}

function buildReviewItem(item, index, categories) {
  const confidence = Number(item.confidence ?? 0);
  return {
    suggestionId: item.suggestionId || createSuggestionId(index),
    selected: true,
    type: item.type || "task",
    title: item.title || "",
    description: item.description || "",
    date: item.date || "",
    time: item.time || "",
    endDate: item.endDate || "",
    endTime: item.endTime || "",
    category: item.category || "",
    categoryId: findCategoryId(item.category, categories),
    priority: item.priority || "medium",
    responsible: item.responsible || "",
    assigneeIds: [],
    confidence,
    warnings: item.warnings || [],
    acceptedLowConfidence: confidence >= LOW_CONFIDENCE_THRESHOLD,
    reminderEnabled: false
  };
}

export default function ImageTaskImportPanel({ categories = [], members = [], onImported }) {
  const { showToast } = useToast();
  const inputRef = useRef(null);
  const previewUrlRef = useRef("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [importReport, setImportReport] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const selectedItems = useMemo(() => reviewItems.filter((item) => item.selected), [reviewItems]);
  const hasLowConfidencePendingReview = selectedItems.some(
    (item) => item.confidence < LOW_CONFIDENCE_THRESHOLD && !item.acceptedLowConfidence
  );

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
  }, []);

  useEffect(() => () => revokePreview(), [revokePreview]);

  const clearSelection = useCallback(() => {
    revokePreview();
    setFile(null);
    setPreviewUrl("");
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    setError("");
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [revokePreview]);

  const acceptFile = useCallback(
    async (nextFile) => {
      setError("");
      setAnalysis(null);
      setReviewItems([]);
      setImportReport(null);

      const validationError = validateImageFile(nextFile);
      if (validationError) {
        setError(validationError);
        showToast({ type: "error", message: validationError });
        return;
      }

      try {
        const dimensionError = await validateImageDimensions(nextFile);
        if (dimensionError) {
          setError(dimensionError);
          showToast({ type: "error", message: dimensionError });
          return;
        }

        const objectUrl = URL.createObjectURL(nextFile);
        revokePreview();
        previewUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
        setFile(nextFile);
      } catch {
        const message = "Nao foi possivel carregar a imagem.";
        setError(message);
        showToast({ type: "error", message });
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [revokePreview, showToast]
  );

  function handleInputChange(event) {
    const nextFile = event.target.files?.[0];
    if (nextFile) acceptFile(nextFile);
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
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) acceptFile(nextFile);
  }

  function updateReviewItem(suggestionId, patch) {
    setReviewItems((current) => current.map((item) => (item.suggestionId === suggestionId ? { ...item, ...patch } : item)));
  }

  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setError("");
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    try {
      const response = await imageAnalysisApi.analyzeTaskSuggestions(file);
      setAnalysis(response);
      setReviewItems((response.items || []).map((item, index) => buildReviewItem(item, index, categories)));
      showToast({ type: "success", message: "Sugestoes geradas para revisao." });
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleImportSuggestions() {
    setError("");
    setImportReport(null);

    if (!selectedItems.length) {
      const message = "Selecione pelo menos uma sugestao revisada.";
      setError(message);
      showToast({ type: "error", message });
      return;
    }
    if (hasLowConfidencePendingReview) {
      const message = "Confirme a revisao dos itens de baixa confianca antes de criar tarefas.";
      setError(message);
      showToast({ type: "error", message });
      return;
    }

    setImporting(true);
    try {
      const report = await tasksApi.importSuggestions({
        items: selectedItems.map((item) => ({
          suggestionId: item.suggestionId,
          type: item.type,
          title: item.title,
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
          reminderValue: item.reminderEnabled ? 1 : null,
          reminderUnit: item.reminderEnabled ? "hours" : null
        }))
      });
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
    <Card className="mx-auto mb-6 max-w-4xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blush/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-blush">
            <Sparkles className="h-3.5 w-3.5" />
            Importar por imagem
          </div>
          <h2 className="text-xl font-black text-ink">Criar sugestoes por imagem</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-muted">
            Revise e confirme antes de transformar sugestoes em tarefas reais.
          </p>
        </div>
        {analysis?.needsUserReview && (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">
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
          className={`min-h-72 rounded-[24px] border border-dashed p-4 transition ${
            dragging ? "border-blush bg-blush/10" : "border-slate-200 bg-white/70"
          }`}
        >
          {previewUrl ? (
            <div className="flex h-full min-h-64 flex-col">
              <div className="relative min-h-52 flex-1 overflow-hidden rounded-[20px] bg-slate-100">
                <img src={previewUrl} alt="Preview da imagem selecionada" className="h-full max-h-80 w-full object-contain" />
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={() => inputRef.current?.click()} disabled={analyzing || importing}>
                  <RefreshCw className="h-4 w-4" />
                  Trocar
                </Button>
                <Button type="button" variant="danger" className="w-full sm:flex-1" onClick={clearSelection} disabled={analyzing || importing}>
                  <Trash2 className="h-4 w-4" />
                  Remover
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-full min-h-64 w-full flex-col items-center justify-center rounded-[20px] bg-white/80 px-4 py-8 text-center transition hover:bg-blush/5"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blush/10 text-blush">
                <UploadCloud className="h-7 w-7" />
              </span>
              <span className="mt-4 text-base font-black text-ink">Selecionar ou arrastar imagem</span>
              <span className="mt-2 text-sm font-semibold text-muted">PNG, JPG, JPEG ou WEBP ate 8 MB.</span>
            </button>
          )}

          <input ref={inputRef} type="file" accept={imageFileAccept} className="hidden" onChange={handleInputChange} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-[22px] bg-white/75 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <FileImage className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-ink">{file?.name || "Nenhuma imagem selecionada"}</p>
                <p className="mt-1 text-xs font-semibold text-muted">
                  {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "A analise usa um adapter isolado e nao salva a imagem."}
                </p>
              </div>
            </div>

            {error && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{error}</p>}

            <Button type="button" className="mt-4 w-full" onClick={handleAnalyze} disabled={!file || analyzing || importing}>
              {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {analyzing ? "Analisando" : "Gerar sugestoes"}
            </Button>
          </div>

          {analysis && (
            <div className="rounded-[22px] bg-white/75 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-black text-ink">Sugestoes para revisar</h3>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  confianca {formatPercent(analysis.overallConfidence)}
                </span>
              </div>

              {analysis.warnings?.length > 0 && (
                <div className="mb-4 space-y-2">
                  {analysis.warnings.map((warning) => (
                    <p key={warning} className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                      {warning}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {reviewItems.map((item, index) => (
                  <article key={item.suggestionId} className="rounded-[20px] border border-slate-200/80 bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateReviewItem(item.suggestionId, { selected: !item.selected })}
                        className={`rounded-full px-3 py-1 text-xs font-black transition ${
                          item.selected ? "bg-blush/10 text-blush" : "bg-slate-100 text-muted"
                        }`}
                      >
                        {item.selected ? "Selecionada" : "Ignorada"}
                      </button>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-muted">{typeLabels[item.type] || item.type}</span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{formatPercent(item.confidence)}</span>
                    </div>

                    <div className="grid gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-muted">Titulo</span>
                        <input className="soft-input" value={item.title} onChange={(event) => updateReviewItem(item.suggestionId, { title: event.target.value })} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black text-muted">Descricao</span>
                        <textarea className="soft-input min-h-20 resize-none" value={item.description} onChange={(event) => updateReviewItem(item.suggestionId, { description: event.target.value })} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-xs font-black text-muted">Data</span>
                          <input className="soft-input" type="date" value={item.date} onChange={(event) => updateReviewItem(item.suggestionId, { date: event.target.value })} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-black text-muted">Horario</span>
                          <input className="soft-input" type="time" value={item.time} onChange={(event) => updateReviewItem(item.suggestionId, { time: event.target.value })} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-black text-muted">Categoria</span>
                          <select
                            className="soft-input"
                            value={item.categoryId}
                            onChange={(event) => {
                              const category = categories.find((candidate) => candidate.id === event.target.value);
                              updateReviewItem(item.suggestionId, {
                                categoryId: event.target.value,
                                category: category?.name || item.category
                              });
                            }}
                          >
                            <option value="">Sem categoria</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-black text-muted">Prioridade</span>
                          <select className="soft-input" value={item.priority} onChange={(event) => updateReviewItem(item.suggestionId, { priority: event.target.value })}>
                            {priorityOptions.map((priority) => (
                              <option key={priority.value} value={priority.value}>
                                {priority.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div>
                        <span className="mb-2 block text-xs font-black text-muted">Responsaveis</span>
                        <AssigneePicker members={members} value={item.assigneeIds} onChange={(assigneeIds) => updateReviewItem(item.suggestionId, { assigneeIds })} />
                        {item.responsible && <p className="mt-2 text-xs font-bold text-muted">Sugestao original: {item.responsible}</p>}
                      </div>

                      <label className="flex items-start gap-3 rounded-2xl bg-blue-50/70 px-3 py-2 text-xs font-bold text-blue-700">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-blue-600"
                          checked={item.reminderEnabled}
                          onChange={(event) => updateReviewItem(item.suggestionId, { reminderEnabled: event.target.checked })}
                          disabled={!item.date}
                        />
                        <span>Ativar lembrete 1 hora antes quando houver data.</span>
                      </label>

                      {item.confidence < LOW_CONFIDENCE_THRESHOLD && (
                        <label className="flex items-start gap-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-amber-600"
                            checked={item.acceptedLowConfidence}
                            onChange={(event) => updateReviewItem(item.suggestionId, { acceptedLowConfidence: event.target.checked })}
                          />
                          <span>Revisei este item de baixa confianca e confirmo que ele pode ser criado.</span>
                        </label>
                      )}

                      <p className="inline-flex items-center gap-2 text-xs font-bold text-muted">
                        <CalendarDays className="h-4 w-4 text-blush" />
                        {formatSchedule(item)}
                      </p>

                      {item.warnings?.length > 0 && (
                        <div className="space-y-2">
                          {item.warnings.map((warning) => (
                            <p key={`${item.suggestionId}-${warning}`} className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                              {warning}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-right text-xs font-bold text-muted">Sugestao {index + 1}</p>
                  </article>
                ))}
              </div>

              <Button type="button" className="mt-4 w-full" onClick={handleImportSuggestions} disabled={importing || !selectedItems.length || hasLowConfidencePendingReview}>
                {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                {importing ? "Criando tarefas" : `Criar ${selectedItems.length} tarefa(s) revisada(s)`}
              </Button>
            </div>
          )}

          {importReport && (
            <div className="rounded-[22px] bg-white/75 p-4">
              <h3 className="mb-3 text-base font-black text-ink">Resultado da importacao</h3>
              <div className="space-y-2">
                {importReport.created?.map((item) => (
                  <p key={item.taskId} className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {item.title} foi criada.
                  </p>
                ))}
                {importReport.failed?.map((item) => (
                  <p key={`${item.suggestionId}-${item.reason}`} className="flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {item.title}: {item.reason}
                  </p>
                ))}
                {importReport.warnings?.map((warning) => (
                  <p key={warning} className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    {warning}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

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
import { imageAnalysisApi, integrationsApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { imageFileAccept, optimizeImageForAnalysis, validateImageDimensions, validateImageFile } from "../utils/files";
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
  const [itemErrors, setItemErrors] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [syncGoogleCalendar, setSyncGoogleCalendar] = useState(false);

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

  useEffect(() => {
    let alive = true;
    integrationsApi.googleCalendarStatus().then(
      (status) => {
        if (alive) setCalendarStatus(status);
      },
      () => {
        if (alive) setCalendarStatus(null);
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!calendarStatus?.can_sync) setSyncGoogleCalendar(false);
  }, [calendarStatus?.can_sync]);

  const clearSelection = useCallback(() => {
    revokePreview();
    setFile(null);
    setPreviewUrl("");
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    setItemErrors({});
    setError("");
    setDragging(false);
    setSyncGoogleCalendar(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [revokePreview]);

  const acceptFile = useCallback(
    async (nextFile) => {
      setError("");
      setAnalysis(null);
      setReviewItems([]);
      setImportReport(null);
      setItemErrors({});

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
    setItemErrors((current) => {
      if (!current[suggestionId]) return current;
      const next = { ...current };
      delete next[suggestionId];
      return next;
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
    if (!file) return;
    setAnalyzing(true);
    setError("");
    setAnalysis(null);
    setReviewItems([]);
    setImportReport(null);
    setItemErrors({});
    try {
      const optimizedFile = await optimizeImageForAnalysis(file);
      const response = await imageAnalysisApi.analyzeTaskSuggestions(optimizedFile);
      setAnalysis(response);
      setReviewItems((response.items || []).map((item, index) => buildReviewItem(item, index, categories)));
      showToast({
        type: response.items?.length ? "success" : "info",
        message: response.items?.length ? "Imagem interpretada com IA real." : "Nenhuma tarefa encontrada na imagem."
      });
    } catch (err) {
      const message = normalizeApiError(err) || "Erro ao interpretar imagem.";
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setAnalyzing(false);
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
    <Card className="mx-auto mb-6 max-w-4xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blush/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-blush">
            <Sparkles className="h-3.5 w-3.5" />
            Importar por imagem
          </div>
          <h2 className="text-xl font-black text-ink">Criar sugestoes por imagem</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-muted">
            A OpenAI interpreta a imagem no backend. Revise e confirme antes de transformar sugestoes em tarefas reais.
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
              {analyzing ? "IA analisando imagem..." : "Interpretar imagem com IA real"}
            </Button>
          </div>

          {analysis && (
            <div className="rounded-[22px] bg-white/75 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-black text-ink">Sugestoes geradas</h3>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  Imagem interpretada com IA real - {formatPercent(analysis.overallConfidence)}
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

              {reviewItems.length === 0 && (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center">
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
                      className={`rounded-[20px] border bg-white p-4 ${
                        itemErrors[item.suggestionId] ? "border-rose-200 ring-2 ring-rose-100" : "border-slate-200/80"
                      }`}
                    >
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
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            item.confidence < LOW_CONFIDENCE_THRESHOLD ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {getConfidenceLabel(item.confidence)} - {formatPercent(item.confidence)}
                        </span>
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

                      <div className="grid gap-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-black text-muted">Titulo</span>
                          <input
                            className="soft-input"
                            value={item.title}
                            aria-invalid={Boolean(itemErrors[item.suggestionId])}
                            onChange={(event) => updateReviewItem(item.suggestionId, { title: event.target.value })}
                          />
                          {itemErrors[item.suggestionId] && (
                            <span className="mt-2 block rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                              {itemErrors[item.suggestionId]}
                            </span>
                          )}
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-black text-muted">Descricao</span>
                          <textarea
                            className="soft-input min-h-20 resize-none"
                            value={item.description}
                            onChange={(event) => updateReviewItem(item.suggestionId, { description: event.target.value })}
                          />
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
                          <span>
                            Ativar lembrete {formatReminderSuggestion(item.reminderValue, item.reminderUnit)} quando houver data.
                          </span>
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

                        {uncertainWarnings.length > 0 && (
                          <div className="space-y-2">
                            {uncertainWarnings.map((warning) => (
                              <p key={`${item.suggestionId}-review-${warning}`} className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                                {warning}
                              </p>
                            ))}
                          </div>
                        )}

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
                  );
                })}
              </div>

              {hasLowConfidencePendingReview && (
                <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                  Ha sugestoes de baixa confianca selecionadas. Marque a confirmacao de revisao nelas antes de criar.
                </p>
              )}

              {calendarStatus?.is_enabled && (
                <label
                  className={`mt-4 flex items-start gap-3 rounded-2xl px-3 py-2 text-xs font-bold ${
                    calendarStatus?.can_sync ? "bg-blue-50/70 text-blue-700" : "bg-slate-100 text-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-blue-600"
                    checked={syncGoogleCalendar}
                    onChange={(event) => setSyncGoogleCalendar(event.target.checked)}
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
                  Trocar imagem
                </Button>
                <Button type="button" className="w-full sm:flex-[1.5]" onClick={handleImportSuggestions} disabled={importing || !selectedItems.length}>
                  {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  {importing ? "Criando tarefas" : `Criar ${selectedItems.length} tarefa(s) selecionada(s)`}
                </Button>
              </div>
            </div>
          )}

          {importReport && (
            <div className="rounded-[22px] bg-white/75 p-4">
              <h3 className="mb-3 text-base font-black text-ink">Resultado da importacao</h3>
              <div className="space-y-2">
                {importReport.created?.map((item) => (
                  <p key={item.taskId} className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {item.title} foi criada.{item.googleCalendarMessage ? ` ${item.googleCalendarMessage}` : ""}
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

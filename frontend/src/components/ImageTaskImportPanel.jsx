import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, FileImage, ImagePlus, Loader2, RefreshCw, Sparkles, Trash2, UploadCloud } from "lucide-react";

import Button from "./Button";
import Card from "./Card";
import { imageAnalysisApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";
import { imageFileAccept, validateImageDimensions, validateImageFile } from "../utils/files";
import { useToast } from "../hooks/useToast";

const typeLabels = {
  task: "Tarefa",
  event: "Evento",
  reminder: "Lembrete"
};

const priorityLabels = {
  low: "Baixa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente"
};

function formatPercent(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

function formatSchedule(item) {
  const start = [item.date, item.time].filter(Boolean).join(" ");
  const end = [item.endDate, item.endTime].filter(Boolean).join(" ");
  if (start && end) return `${start} ate ${end}`;
  return start || "Sem data definida";
}

export default function ImageTaskImportPanel() {
  const { showToast } = useToast();
  const inputRef = useRef(null);
  const previewUrlRef = useRef("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);

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
    setError("");
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [revokePreview]);

  const acceptFile = useCallback(
    async (nextFile) => {
      setError("");
      setAnalysis(null);

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

  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setError("");
    setAnalysis(null);
    try {
      const response = await imageAnalysisApi.analyzeTaskSuggestions(file);
      setAnalysis(response);
      showToast({ type: "success", message: "Sugestoes geradas para revisao." });
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setAnalyzing(false);
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
            O resultado aparece apenas como sugestao revisavel.
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
                <Button type="button" variant="secondary" className="w-full sm:flex-1" onClick={() => inputRef.current?.click()} disabled={analyzing}>
                  <RefreshCw className="h-4 w-4" />
                  Trocar
                </Button>
                <Button type="button" variant="danger" className="w-full sm:flex-1" onClick={clearSelection} disabled={analyzing}>
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

            <Button type="button" className="mt-4 w-full" onClick={handleAnalyze} disabled={!file || analyzing}>
              {analyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              {analyzing ? "Analisando" : "Gerar sugestoes"}
            </Button>
          </div>

          {analysis && (
            <div className="rounded-[22px] bg-white/75 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-black text-ink">Sugestoes encontradas</h3>
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

              <div className="space-y-3">
                {analysis.items?.map((item, index) => (
                  <article key={`${item.title}-${index}`} className="rounded-[20px] border border-slate-200/80 bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blush/10 px-3 py-1 text-xs font-black text-blush">{typeLabels[item.type] || item.type}</span>
                      {item.priority && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-muted">{priorityLabels[item.priority]}</span>}
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{formatPercent(item.confidence)}</span>
                    </div>
                    <h4 className="text-sm font-black text-ink">{item.title}</h4>
                    {item.description && <p className="mt-2 text-sm font-semibold leading-relaxed text-muted">{item.description}</p>}
                    <div className="mt-3 grid gap-2 text-xs font-bold text-muted sm:grid-cols-2">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-blush" />
                        {formatSchedule(item)}
                      </span>
                      <span>{item.category || "Sem categoria"}</span>
                      <span>{item.responsible || "Sem responsavel"}</span>
                    </div>
                    {item.warnings?.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {item.warnings.map((warning) => (
                          <p key={warning} className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                            {warning}
                          </p>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

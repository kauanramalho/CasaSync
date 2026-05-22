import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  FileText,
  Image,
  Info,
  Loader2,
  Tag,
  X
} from "lucide-react";

import AssigneeStack from "./AssigneeStack";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./Badges";
import Button from "./Button";
import { tasksApi } from "../services/api";
import { formatDate, normalizeApiError } from "../utils/formatters";
import { getStoredPreferences } from "../utils/preferences";
import { formatReminderList, normalizeReminderList } from "../utils/taskReminders";
import { getTaskPointLabel } from "../utils/tasks";
import { formatFileSize } from "../utils/files";

function formatFullDateTime(value, fallback = "Sem data") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: getStoredPreferences().timezone
  }).format(date);
}

function attachmentIcon(mimeType) {
  return String(mimeType || "").startsWith("image/") ? Image : FileText;
}

function isImageAttachment(attachment) {
  return String(attachment?.mime_type || "").startsWith("image/");
}

function DetailSection({ title, children, className = "" }) {
  return (
    <section className={`rounded-[22px] border border-slate-100 bg-white/75 p-4 shadow-sm ${className}`}>
      <h3 className="mb-3 text-xs font-black uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function DetailMetric({ icon: Icon, label, value, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    rose: "bg-rose-50 text-blush",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700"
  };

  return (
    <div className={`rounded-2xl px-3 py-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide opacity-75">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-sm font-black leading-snug text-ink">{value}</p>
    </div>
  );
}

export default function TaskDetailsModal({ task, onClose, onEdit }) {
  const [details, setDetails] = useState(task);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [imagePreviews, setImagePreviews] = useState({});

  const currentTask = details || task;
  const attachments = useMemo(() => currentTask?.attachments || [], [currentTask?.attachments]);

  useEffect(() => {
    if (!task?.id) return undefined;
    let alive = true;
    setDetails(task);
    setError("");
    setLoading(true);
    tasksApi
      .retrieve(task.id)
      .then((row) => {
        if (alive) setDetails(row);
      })
      .catch((err) => {
        if (alive) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [task]);

  useEffect(() => {
    if (!task) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, task]);

  useEffect(() => {
    let alive = true;
    const objectUrls = [];
    setImagePreviews({});

    async function loadImagePreviews() {
      const imageAttachments = attachments.filter(isImageAttachment);
      if (!currentTask?.id || !imageAttachments.length) return;

      const nextPreviews = {};
      await Promise.all(
        imageAttachments.map(async (attachment) => {
          try {
            const { blob, contentType } = await tasksApi.downloadAttachment(currentTask.id, attachment.id);
            if (!alive) return;
            const objectUrl = URL.createObjectURL(new Blob([blob], { type: contentType || attachment.mime_type }));
            objectUrls.push(objectUrl);
            nextPreviews[attachment.id] = objectUrl;
          } catch {
            // Preview is optional; the open/download action remains available.
          }
        })
      );
      if (alive) setImagePreviews(nextPreviews);
    }

    loadImagePreviews();
    return () => {
      alive = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachments, currentTask?.id]);

  if (!task) return null;

  async function openAttachment(attachment) {
    if (!currentTask?.id || !attachment?.id) return;
    setOpeningId(attachment.id);
    setError("");
    try {
      const { blob, contentType } = await tasksApi.downloadAttachment(currentTask.id, attachment.id);
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: contentType || attachment.mime_type }));
      const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = attachment.original_name || "anexo";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err) {
      setError(normalizeApiError(err) || "Nao foi possivel abrir o anexo.");
    } finally {
      setOpeningId("");
    }
  }

  function handleEdit() {
    onEdit?.(currentTask);
  }

  const reminderSummary = formatReminderList(normalizeReminderList(currentTask || {}));
  const reminderLabel = reminderSummary
    ? `${reminderSummary}${currentTask.reminder_sent ? " - ja enviado" : ""}`
    : "Sem lembrete ativo";
  const calendarLabel = currentTask?.google_calendar_event_id
    ? `Sincronizada${currentTask.google_calendar_synced_at ? ` em ${formatFullDateTime(currentTask.google_calendar_synced_at)}` : ""}`
    : "Nao sincronizada";

  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-slate-900/30 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-details-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-soft animate-in sm:rounded-[30px]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-lavender/10 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blush/15 bg-blush/10 px-3 py-1 text-xs font-black uppercase text-blush">
                  <Info className="h-3.5 w-3.5" />
                  Detalhes da tarefa
                </span>
                {loading && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Atualizando
                  </span>
                )}
              </div>
              <h2 id="task-details-title" className="break-words text-2xl font-black leading-tight text-ink sm:text-3xl">
                {currentTask?.title || "Tarefa"}
              </h2>
              <p className="mt-2 text-sm font-semibold text-muted">
                Criada por {currentTask?.creator?.name || "CasaSync"} - {formatDate(currentTask?.created_at, "sem data de criacao")}
              </p>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-50 text-muted transition hover:text-ink" aria-label="Fechar detalhes">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <CategoryBadge category={currentTask?.category} />
            <PriorityBadge priority={currentTask?.priority} />
            <StatusBadge status={currentTask?.status} />
            <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
              {getTaskPointLabel(currentTask)}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {error && <p className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <DetailSection title="Descricao">
                {currentTask?.description ? (
                  <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-ink">{currentTask.description}</p>
                ) : (
                  <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm font-semibold text-muted">Nenhuma descricao adicionada.</p>
                )}
              </DetailSection>

              <DetailSection title="Anexos">
                {attachments.length ? (
                  <div className="space-y-3">
                    {attachments.map((attachment) => {
                      const Icon = attachmentIcon(attachment.mime_type);
                      const previewUrl = imagePreviews[attachment.id];
                      return (
                        <div key={attachment.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-100 bg-surface/80 p-3 sm:flex-row sm:items-center">
                          <div className="h-20 w-full overflow-hidden rounded-2xl bg-slate-50 sm:h-16 sm:w-20 sm:shrink-0">
                            {previewUrl ? (
                              <img src={previewUrl} alt={`Preview de ${attachment.original_name || "anexo"}`} className="h-full w-full object-cover" />
                            ) : (
                              <span className="grid h-full w-full place-items-center text-blush">
                                <Icon className="h-7 w-7" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-ink">{attachment.original_name || "Anexo"}</p>
                            <p className="mt-1 text-xs font-semibold text-muted">
                              {attachment.mime_type || "arquivo"} - {formatFileSize(attachment.size)}
                            </p>
                          </div>
                          <Button type="button" variant="secondary" className="w-full px-3 py-2 text-xs sm:w-auto" onClick={() => openAttachment(attachment)} disabled={openingId === attachment.id}>
                            {openingId === attachment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                            {openingId === attachment.id ? "Abrindo..." : isImageAttachment(attachment) ? "Ver imagem" : "Abrir arquivo"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm font-semibold text-muted">Nenhum anexo vinculado a esta tarefa.</p>
                )}
              </DetailSection>
            </div>

            <div className="space-y-4">
              <DetailSection title="Resumo">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <DetailMetric icon={CalendarClock} label="Prazo" value={formatFullDateTime(currentTask?.due_date, "Sem prazo")} tone="blue" />
                  <DetailMetric icon={BellRing} label="Lembrete" value={reminderLabel} tone={currentTask?.reminder_enabled ? "amber" : "slate"} />
                  <DetailMetric icon={CalendarCheck} label="Google Agenda" value={calendarLabel} tone={currentTask?.google_calendar_event_id ? "emerald" : "slate"} />
                  <DetailMetric icon={Clock3} label="Criada" value={formatFullDateTime(currentTask?.created_at, "Sem criacao")} tone="slate" />
                  <DetailMetric icon={Clock3} label="Atualizada" value={formatFullDateTime(currentTask?.updated_at, "Sem atualizacao")} tone="rose" />
                </div>
              </DetailSection>

              <DetailSection title="Responsaveis">
                <AssigneeStack task={currentTask} className="rounded-2xl bg-slate-50 px-3 py-3" emptyText="Nenhum responsavel definido" />
              </DetailSection>

              <DetailSection title="Metadados">
                <div className="space-y-2 text-sm font-semibold text-muted">
                  <p className="flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                    <Tag className="mt-0.5 h-4 w-4 shrink-0 text-blush" />
                    Tipo: {currentTask?.task_type || "tarefa"}
                  </p>
                  {currentTask?.completed_at && (
                    <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      Concluida em {formatFullDateTime(currentTask.completed_at)}
                    </p>
                  )}
                  {currentTask?.automation_source_label && (
                    <p className="flex items-start gap-2 rounded-2xl bg-blue-50 px-3 py-2 text-blue-700">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      Origem: {currentTask.automation_source_label}
                    </p>
                  )}
                  {currentTask?.automation_source_reference && (
                    <p className="whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 text-xs leading-relaxed text-muted">
                      {currentTask.automation_source_reference}
                    </p>
                  )}
                </div>
              </DetailSection>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-white/90 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            Fechar
          </Button>
          {onEdit && (
            <Button type="button" className="w-full sm:w-auto" onClick={handleEdit}>
              <Edit3 className="h-5 w-5" />
              Editar tarefa
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

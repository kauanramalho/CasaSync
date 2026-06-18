import { useMemo, useRef, useState } from "react";
import { ExternalLink, FileText, Image, Paperclip, Trash2, Upload } from "lucide-react";

import { tasksApi } from "../services/api";
import { formatFileSize, taskAttachmentAccept, validateTaskAttachmentFile } from "../utils/files";

function attachmentIcon(mimeType) {
  return String(mimeType || "").startsWith("image/") ? Image : FileText;
}

export default function TaskAttachmentField({
  taskId,
  existingAttachments = [],
  removedAttachmentIds = [],
  pendingFiles = [],
  onPendingFilesChange,
  onRemoveExisting,
  disabled = false,
  onError
}) {
  const inputRef = useRef(null);
  const [fieldError, setFieldError] = useState("");
  const [openingId, setOpeningId] = useState("");
  const removedIds = useMemo(() => new Set(removedAttachmentIds), [removedAttachmentIds]);
  const visibleAttachments = useMemo(() => existingAttachments.filter((attachment) => !removedIds.has(attachment.id)), [existingAttachments, removedIds]);

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function setError(message) {
    setFieldError(message);
    onError?.(message);
  }

  function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      const validationError = validateTaskAttachmentFile(file);
      if (validationError) {
        setError(validationError);
        clearInput();
        return;
      }
    }

    setFieldError("");
    onPendingFilesChange?.([...pendingFiles, ...files]);
    clearInput();
  }

  function removePendingFile(index) {
    onPendingFilesChange?.(pendingFiles.filter((_, itemIndex) => itemIndex !== index));
  }

  async function openAttachment(attachment) {
    if (!taskId || !attachment?.id) return;
    setOpeningId(attachment.id);
    setFieldError("");
    try {
      const { blob, contentType } = await tasksApi.downloadAttachment(taskId, attachment.id);
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
    } catch (error) {
      setError(error?.message || "Nao foi possivel abrir o anexo.");
    } finally {
      setOpeningId("");
    }
  }

  return (
    <div className="md:col-span-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <label className="block text-sm font-semibold text-ink">Anexos</label>
        <span className="text-xs font-semibold text-muted">PNG, JPG, JPEG, WEBP ou PDF ate 8 MB</span>
      </div>

      <div className="rounded-[22px] border border-slate-100 bg-white/70 p-4">
        <label
          className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blush shadow-card transition hover:-translate-y-0.5 hover:bg-rose-50 sm:w-auto ${
            disabled ? "pointer-events-none opacity-60" : "cursor-pointer"
          }`}
        >
          <Upload className="h-4 w-4" />
          Anexar arquivo
          <input ref={inputRef} type="file" accept={taskAttachmentAccept} multiple className="hidden" onChange={handleFiles} disabled={disabled} />
        </label>

        {(visibleAttachments.length > 0 || pendingFiles.length > 0) && (
          <div className="mt-4 space-y-2">
            {visibleAttachments.map((attachment) => {
              const Icon = attachmentIcon(attachment.mime_type);
              return (
                <div key={attachment.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-100 bg-surface/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blush/10 text-blush">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{attachment.original_name}</p>
                      <p className="text-xs font-semibold text-muted">{formatFileSize(attachment.size)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => openAttachment(attachment)}
                      disabled={disabled || openingId === attachment.id}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-ink shadow-sm transition hover:bg-blue-50 disabled:opacity-60 sm:flex-none"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {openingId === attachment.id ? "Abrindo..." : "Abrir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveExisting?.(attachment.id)}
                      disabled={disabled}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-60 sm:flex-none"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}

            {pendingFiles.map((file, index) => (
              <div key={`${file.name}-${file.size}-${index}`} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-dashed border-blush/25 bg-rose-50/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blush">
                    <Paperclip className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{file.name}</p>
                    <p className="text-xs font-semibold text-muted">{formatFileSize(file.size)} para enviar ao salvar</p>
                  </div>
                </div>
                <button
                type="button"
                onClick={() => removePendingFile(index)}
                disabled={disabled}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60 sm:w-auto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}

        {visibleAttachments.length === 0 && pendingFiles.length === 0 && (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 text-sm font-semibold text-muted">Nenhum anexo adicionado.</p>
        )}

        {fieldError && <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{fieldError}</p>}
      </div>
    </div>
  );
}

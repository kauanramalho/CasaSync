import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ImagePlus, SlidersHorizontal, Trash2, X } from "lucide-react";

import { cropImageDataUrl, defaultCrop, imageFileAccept, readFileAsDataUrl, validateImageFile } from "../utils/files";

function backgroundPosition(crop) {
  return `${50 + (Number(crop.x) || 0) / 4}% ${50 + (Number(crop.y) || 0) / 4}%`;
}

const ImageAdjustField = forwardRef(function ImageAdjustField(
  {
    value = "",
    label,
    helper = "PNG, JPG ou WEBP ate 2 MB.",
    chooseLabel = "Escolher imagem",
    removeLabel = "Remover imagem",
    cancelLabel = "Cancelar ajuste",
    disabled = false,
    emptyLabel = "",
    previewClassName = "h-40 w-40 rounded-full",
    outputWidth = 512,
    outputHeight = 512,
    outputQuality = 0.9,
    className = "",
    onError,
    onRemove
  },
  ref
) {
  const inputRef = useRef(null);
  const lastValueRef = useRef(value);
  const [draft, setDraft] = useState("");
  const [removed, setRemoved] = useState(false);
  const [crop, setCrop] = useState(defaultCrop);
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    setDraft("");
    setRemoved(false);
    setCrop(defaultCrop);
    setFieldError("");
  }, [value]);

  const previewUrl = useMemo(() => {
    if (removed) return "";
    return draft || value || "";
  }, [draft, removed, value]);

  useImperativeHandle(
    ref,
    () => ({
      async getValue() {
        if (removed) return null;
        if (draft) {
          return cropImageDataUrl(draft, crop, {
            width: outputWidth,
            height: outputHeight,
            quality: outputQuality
          });
        }
        return value || null;
      },
      resetDraft() {
        setDraft("");
        setRemoved(false);
        setCrop(defaultCrop);
        setFieldError("");
        if (inputRef.current) inputRef.current.value = "";
      }
    }),
    [crop, draft, outputHeight, outputQuality, outputWidth, removed, value]
  );

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setFieldError(validationError);
      onError?.(validationError);
      clearInput();
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDraft(dataUrl);
      setRemoved(false);
      setCrop(defaultCrop);
      setFieldError("");
    } catch {
      const message = "Nao foi possivel carregar a imagem.";
      setFieldError(message);
      onError?.(message);
    } finally {
      clearInput();
    }
  }

  function cancelDraft() {
    setDraft("");
    setRemoved(false);
    setCrop(defaultCrop);
    setFieldError("");
    clearInput();
  }

  function removeImage() {
    setDraft("");
    setRemoved(true);
    setCrop(defaultCrop);
    setFieldError("");
    clearInput();
    onRemove?.();
  }

  const previewStyle = previewUrl
    ? {
        backgroundImage: `url(${previewUrl})`,
        backgroundSize: draft ? `${Math.max(100, crop.zoom * 100)}%` : "cover",
        backgroundPosition: draft ? backgroundPosition(crop) : "center"
      }
    : undefined;

  return (
    <div className={className}>
      {label && <p className="text-sm font-bold text-ink">{label}</p>}
      <div
        className={`overflow-hidden bg-gradient-to-br from-rose-100 to-violet-100 bg-cover bg-center shadow-card ${previewClassName}`}
        style={previewStyle}
      >
        {!previewUrl && <div className="grid h-full w-full place-items-center text-4xl font-bold text-ink">{emptyLabel || <ImagePlus className="h-7 w-7 text-blush" />}</div>}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blush shadow-card transition hover:-translate-y-0.5 hover:bg-rose-50 ${disabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          <ImagePlus className="h-4 w-4" />
          {chooseLabel}
          <input ref={inputRef} type="file" accept={imageFileAccept} className="hidden" onChange={handleFile} disabled={disabled} />
        </label>

        {previewUrl && !disabled && (
          <button
            type="button"
            onClick={removeImage}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            {removeLabel}
          </button>
        )}
      </div>

      {helper && <p className="mt-3 text-xs font-semibold text-muted">{helper}</p>}
      {fieldError && <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{fieldError}</p>}

      {draft && !disabled && (
        <div className="mt-5 space-y-3 rounded-2xl bg-white/80 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-muted">
            <SlidersHorizontal className="h-4 w-4 text-blush" />
            Ajuste
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-muted">
              <span>Zoom</span>
              <span>{crop.zoom.toFixed(1)}x</span>
            </div>
            <input className="w-full accent-rose-400" type="range" min="1" max="2.4" step="0.1" value={crop.zoom} onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))} />
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-muted">Posicao</p>
            <input className="w-full accent-rose-400" type="range" min="-40" max="40" value={crop.x} onChange={(event) => setCrop((current) => ({ ...current, x: Number(event.target.value) }))} />
            <input className="mt-2 w-full accent-rose-400" type="range" min="-40" max="40" value={crop.y} onChange={(event) => setCrop((current) => ({ ...current, y: Number(event.target.value) }))} />
          </div>
          <button type="button" onClick={cancelDraft} className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-blush">
            <X className="h-4 w-4" />
            {cancelLabel}
          </button>
        </div>
      )}
    </div>
  );
});

export default ImageAdjustField;

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ImagePlus, SlidersHorizontal, Trash2, X } from "lucide-react";

import { resolveApiAssetUrl, uploadsApi } from "../services/api";
import {
  cropImageFileToBlob,
  defaultCrop,
  imageFileAccept,
  optimizedImageMaxBytes,
  validateImageDimensions,
  validateImageFile
} from "../utils/files";

function backgroundPosition(crop) {
  return `${50 + (Number(crop.x) || 0) / 4}% ${50 + (Number(crop.y) || 0) / 4}%`;
}

function isInlineImage(value) {
  return String(value || "").trim().toLowerCase().startsWith("data:image/");
}

const ImageAdjustField = forwardRef(function ImageAdjustField(
  {
    value = "",
    label,
    helper = "PNG, JPG ou WEBP. A imagem sera otimizada automaticamente.",
    chooseLabel = "Escolher imagem",
    removeLabel = "Remover imagem",
    cancelLabel = "Cancelar ajuste",
    disabled = false,
    emptyLabel = "",
    previewClassName = "h-40 w-40 rounded-full",
    outputWidth = 512,
    outputHeight = 512,
    outputQuality = 0.86,
    outputMimeType = "image/webp",
    maxOptimizedBytes = optimizedImageMaxBytes,
    uploadScope = "system",
    uploadFamilyId,
    className = "",
    onError,
    onRemove
  },
  ref
) {
  const inputRef = useRef(null);
  const draftUrlRef = useRef("");
  const lastValueRef = useRef(value);
  const [draftUrl, setDraftUrl] = useState("");
  const [draftFile, setDraftFile] = useState(null);
  const [removed, setRemoved] = useState(false);
  const [crop, setCrop] = useState(defaultCrop);
  const [fieldError, setFieldError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);

  const revokeDraftUrl = useCallback(() => {
    if (draftUrlRef.current) {
      URL.revokeObjectURL(draftUrlRef.current);
      draftUrlRef.current = "";
    }
  }, []);

  const clearDraft = useCallback(() => {
    revokeDraftUrl();
    setDraftUrl("");
    setDraftFile(null);
  }, [revokeDraftUrl]);

  useEffect(() => () => revokeDraftUrl(), [revokeDraftUrl]);

  useEffect(() => {
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    clearDraft();
    setRemoved(false);
    setCrop(defaultCrop);
    setFieldError("");
    setPreviewBroken(false);
  }, [clearDraft, value]);

  const previewUrl = useMemo(() => {
    if (removed) return "";
    if (draftUrl) return draftUrl;
    if (previewBroken) return "";
    return resolveApiAssetUrl(value);
  }, [draftUrl, previewBroken, removed, value]);

  useImperativeHandle(
    ref,
    () => ({
      async getValue() {
        if (removed) return null;
        if (!draftFile) {
          return value && !isInlineImage(value) ? value : null;
        }

        try {
          setProcessing(true);
          const optimizedFile = await cropImageFileToBlob(draftFile, crop, {
            width: outputWidth,
            height: outputHeight,
            quality: outputQuality,
            mimeType: outputMimeType,
            maxBytes: maxOptimizedBytes
          });
          const uploaded = await uploadsApi.uploadImage(optimizedFile, {
            scope: uploadScope,
            familyId: uploadFamilyId
          });
          if (!uploaded?.url) {
            throw new Error("O servidor nao confirmou a URL da imagem enviada.");
          }
          return uploaded.url;
        } catch (error) {
          const message = error?.message || "Nao foi possivel otimizar e enviar a imagem.";
          setFieldError(message);
          onError?.(message);
          throw error;
        } finally {
          setProcessing(false);
        }
      },
      resetDraft() {
        clearDraft();
        setRemoved(false);
        setCrop(defaultCrop);
        setFieldError("");
        setProcessing(false);
        setPreviewBroken(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    }),
    [
      clearDraft,
      crop,
      draftFile,
      maxOptimizedBytes,
      onError,
      outputHeight,
      outputMimeType,
      outputQuality,
      outputWidth,
      removed,
      uploadFamilyId,
      uploadScope,
      value
    ]
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
      const dimensionError = await validateImageDimensions(file);
      if (dimensionError) {
        setFieldError(dimensionError);
        onError?.(dimensionError);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      revokeDraftUrl();
      draftUrlRef.current = objectUrl;
      setDraftUrl(objectUrl);
      setDraftFile(file);
      setRemoved(false);
      setPreviewBroken(false);
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
    clearDraft();
    setRemoved(false);
    setCrop(defaultCrop);
    setFieldError("");
    setPreviewBroken(false);
    clearInput();
  }

  function removeImage() {
    clearDraft();
    setRemoved(true);
    setCrop(defaultCrop);
    setFieldError("");
    setPreviewBroken(false);
    clearInput();
    onRemove?.();
  }

  const previewStyle = draftUrl && previewUrl
    ? {
        backgroundImage: `url(${previewUrl})`,
        backgroundSize: `${Math.max(100, crop.zoom * 100)}%`,
        backgroundPosition: backgroundPosition(crop)
      }
    : undefined;
  const controlsDisabled = disabled || processing;
  const hasRemovableImage = Boolean(previewUrl || (!removed && value && !isInlineImage(value)));

  return (
    <div className={className}>
      {label && <p className="text-sm font-bold text-ink">{label}</p>}
      <div
        className={`relative overflow-hidden bg-gradient-to-br from-rose-100 to-violet-100 bg-cover bg-center shadow-card ${previewClassName}`}
        style={previewStyle}
        aria-busy={processing}
      >
        {!draftUrl && previewUrl && (
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => {
              setPreviewBroken(true);
              setFieldError("A imagem salva nao carregou. Escolha outra foto ou remova a atual.");
            }}
          />
        )}
        {!previewUrl && <div className="grid h-full w-full place-items-center text-4xl font-bold text-ink">{emptyLabel || <ImagePlus className="h-7 w-7 text-blush" />}</div>}
        {processing && (
          <div className="absolute inset-0 grid place-items-center bg-white/75 px-3 text-center text-xs font-black text-blush backdrop-blur-sm">
            Enviando...
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blush shadow-card transition hover:-translate-y-0.5 hover:bg-rose-50 ${controlsDisabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          <ImagePlus className="h-4 w-4" />
          {processing ? "Enviando..." : chooseLabel}
          <input ref={inputRef} type="file" accept={imageFileAccept} className="hidden" onChange={handleFile} disabled={controlsDisabled} />
        </label>

        {hasRemovableImage && !controlsDisabled && (
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

      {draftUrl && !controlsDisabled && (
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

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ImagePlus, Crop, Trash2 } from "lucide-react";
import ImageCropEditor, { cropPreviewStyle } from "./ImageCropEditor";

import { uploadsApi } from "../services/api";
import {
  cropImageFileToBlob,
  defaultCrop,
  imageFileAccept,
  inspectImageFile,
  optimizedImageMaxBytes,
  validateImageDimensions,
  validateImageFile
} from "../utils/files";

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
  const [editing, setEditing] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [editorCrop, setEditorCrop] = useState(defaultCrop);
  const [confirmedDraft, setConfirmedDraft] = useState(false);

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
    setEditing(false);
    setConfirmedDraft(false);
  }, [revokeDraftUrl]);

  useEffect(() => () => revokeDraftUrl(), [revokeDraftUrl]);

  useEffect(() => {
    if (lastValueRef.current === value) return;
    lastValueRef.current = value;
    clearDraft();
    setRemoved(false);
    setCrop(defaultCrop);
    setFieldError("");
  }, [clearDraft, value]);

  const previewUrl = useMemo(() => {
    if (removed) return "";
    return draftUrl || value || "";
  }, [draftUrl, removed, value]);

  useImperativeHandle(
    ref,
    () => ({
      async getValue() {
        if (removed) return null;
        if (!draftFile) {
          return value && !isInlineImage(value) ? value : null;
        }

        try {
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
          return uploaded.url;
        } catch (error) {
          const message = error?.message || "Nao foi possivel otimizar e enviar a imagem.";
          setFieldError(message);
          onError?.(message);
          throw error;
        }
      },
      resetDraft() {
        clearDraft();
        setRemoved(false);
        setCrop(defaultCrop);
        setFieldError("");
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

      setDimensions(await inspectImageFile(file));
      const objectUrl = URL.createObjectURL(file);
      revokeDraftUrl();
      draftUrlRef.current = objectUrl;
      setDraftUrl(objectUrl);
      setDraftFile(file);
      setRemoved(false);
      setCrop(defaultCrop);
      setEditorCrop(defaultCrop);
      setConfirmedDraft(false);
      setEditing(true);
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
    clearInput();
  }

  function removeImage() {
    clearDraft();
    setRemoved(true);
    setCrop(defaultCrop);
    setFieldError("");
    clearInput();
    onRemove?.();
  }

  const previewStyle = previewUrl && !draftUrl
    ? {
        backgroundImage: `url(${previewUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }
    : undefined;

  return (
    <div className={className}>
      {label && <p className="text-sm font-bold text-ink">{label}</p>}
      <div
        className={`relative overflow-hidden theme-avatar bg-cover bg-center shadow-card ${previewClassName}`}
        style={previewStyle}
      >
        {draftUrl && <img src={draftUrl} alt="Prévia da foto recortada" className="absolute" style={cropPreviewStyle(dimensions, crop, outputWidth / outputHeight)} />}
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

      {draftUrl && !disabled && (
        <button type="button" onClick={() => { setEditorCrop(crop); setEditing(true); }} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-blush"><Crop className="h-4 w-4" />Ajustar recorte</button>
      )}
      {editing && draftUrl && !disabled && <ImageCropEditor url={draftUrl} dimensions={dimensions} crop={editorCrop} onChange={setEditorCrop} ratio={outputWidth / outputHeight} onCancel={() => { if (confirmedDraft) setEditing(false); else cancelDraft(); }} onConfirm={() => { setCrop(editorCrop); setConfirmedDraft(true); setEditing(false); }} />}
    </div>
  );
});

export default ImageAdjustField;

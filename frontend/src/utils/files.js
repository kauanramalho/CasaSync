export const imageFileTypes = ["image/png", "image/jpeg", "image/webp"];
export const imageFileExtensions = [".png", ".jpg", ".jpeg", ".webp"];
export const imageFileAccept = [...imageFileTypes, ...imageFileExtensions].join(",");
export const defaultImageMaxBytes = 8 * 1024 * 1024;
export const optimizedImageMaxBytes = 560 * 1024;
export const maxImagePixels = 36_000_000;
export const maxImageSide = 8000;
export const defaultCrop = { zoom: 1, x: 0, y: 0 };

export const taskAttachmentMaxBytes = 8 * 1024 * 1024;
export const taskAttachmentFileTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
export const taskAttachmentFileExtensions = [".png", ".jpg", ".jpeg", ".webp", ".pdf"];
export const taskAttachmentAccept = [...taskAttachmentFileTypes, ...taskAttachmentFileExtensions].join(",");

export function validateImageFile(file, maxBytes = defaultImageMaxBytes) {
  if (!file) return "Selecione uma imagem.";
  const extension = `.${(file.name || "").split(".").pop() || ""}`.toLowerCase();
  if (!imageFileExtensions.includes(extension)) return "Use uma imagem PNG, JPG, JPEG ou WEBP.";
  if (!imageFileTypes.includes(file.type)) return "Use uma imagem PNG, JPG, JPEG ou WEBP.";
  if (file.size > maxBytes) return "A imagem deve ter no maximo 8 MB antes da otimizacao.";
  return "";
}

export function formatFileSize(bytes = 0) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function validateTaskAttachmentFile(file, maxBytes = taskAttachmentMaxBytes) {
  if (!file) return "Selecione um arquivo.";
  const extension = `.${(file.name || "").split(".").pop() || ""}`.toLowerCase();
  const mimeType = (file.type || "").toLowerCase();
  if (!taskAttachmentFileExtensions.includes(extension)) return "Use apenas imagem PNG, JPG, JPEG, WEBP ou PDF.";
  if (!taskAttachmentFileTypes.includes(mimeType)) return "Use apenas imagem PNG, JPG, JPEG, WEBP ou PDF.";
  if (file.size > maxBytes) return "O anexo deve ter no maximo 8 MB.";
  return "";
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Nao foi possivel otimizar a imagem."));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

export async function inspectImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(url);
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function validateImageDimensions(file) {
  const { width, height } = await inspectImageFile(file);
  if (!width || !height) return "Nao foi possivel ler as dimensoes da imagem.";
  if (width > maxImageSide || height > maxImageSide || width * height > maxImagePixels) {
    return "Imagem grande demais. Use uma foto com ate 8000 px por lado.";
  }
  return "";
}

export async function cropImageFileToBlob(
  file,
  crop = defaultCrop,
  {
    width = 512,
    height = 512,
    mimeType = "image/webp",
    quality = 0.86,
    maxBytes = optimizedImageMaxBytes,
    filename = "imagem-casasync.webp"
  } = {}
) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(sourceUrl);
    const qualities = [quality, 0.78, 0.68, 0.58, 0.48];
    let targetWidth = width;
    let targetHeight = height;
    let lastBlob = null;

    for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      const zoom = Math.max(1, Number(crop.zoom) || 1);
      const scale = Math.max(targetWidth / image.width, targetHeight / image.height) * zoom;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const maxShiftX = Math.max(0, (drawWidth - targetWidth) / 2);
      const maxShiftY = Math.max(0, (drawHeight - targetHeight) / 2);
      const dx = (targetWidth - drawWidth) / 2 + ((Number(crop.x) || 0) / 40) * maxShiftX;
      const dy = (targetHeight - drawHeight) / 2 + ((Number(crop.y) || 0) / 40) * maxShiftY;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

      for (const candidateQuality of qualities) {
        const blob = await canvasToBlob(canvas, mimeType, candidateQuality);
        lastBlob = blob;
        if (blob.size <= maxBytes) {
          return new File([blob], filename, { type: mimeType, lastModified: Date.now() });
        }
      }

      targetWidth = Math.max(256, Math.round(targetWidth * 0.85));
      targetHeight = Math.max(256, Math.round(targetHeight * 0.85));
    }

    if (lastBlob) {
      throw new Error("Mesmo otimizada, a imagem ficou grande demais. Tente outra foto.");
    }
    throw new Error("Nao foi possivel otimizar a imagem.");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

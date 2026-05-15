export const imageFileTypes = ["image/png", "image/jpeg", "image/webp"];
export const imageFileAccept = imageFileTypes.join(",");
export const defaultImageMaxBytes = 2 * 1024 * 1024;
export const defaultCrop = { zoom: 1, x: 0, y: 0 };

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function validateImageFile(file, maxBytes = defaultImageMaxBytes) {
  if (!file) return "Selecione uma imagem.";
  if (!imageFileTypes.includes(file.type)) return "Use uma imagem PNG, JPG, JPEG ou WEBP.";
  if (file.size > maxBytes) return "A imagem deve ter no maximo 2 MB.";
  return "";
}

export function cropImageDataUrl(
  dataUrl,
  crop = defaultCrop,
  { width = 512, height = 512, mimeType = "image/jpeg", quality = 0.9 } = {}
) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const zoom = Math.max(1, Number(crop.zoom) || 1);
      const scale = Math.max(width / image.width, height / image.height) * zoom;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const maxShiftX = Math.max(0, (drawWidth - width) / 2);
      const maxShiftY = Math.max(0, (drawHeight - height) / 2);
      const dx = (width - drawWidth) / 2 + ((Number(crop.x) || 0) / 40) * maxShiftX;
      const dy = (height - drawHeight) / 2 + ((Number(crop.y) || 0) / 40) * maxShiftY;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
      resolve(canvas.toDataURL(mimeType, quality));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

export const imageFileTypes = ["image/png", "image/jpeg", "image/webp"];
export const defaultImageMaxBytes = 2 * 1024 * 1024;

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


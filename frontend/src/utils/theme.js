export const THEME_STORAGE_KEY = "casasync_palette";

export const palettes = [
  {
    id: "professional-blue",
    name: "Azul Profissional",
    description: "Claro, moderno e confiavel para a rotina da casa.",
    swatches: ["#2563eb", "#60a5fa", "#f8fbff", "#ffffff"],
    dark: false
  },
  {
    id: "nature-green",
    name: "Verde Natureza",
    description: "Calmo, acolhedor e com destaques naturais.",
    swatches: ["#16a34a", "#84cc16", "#f3fbf5", "#ffffff"],
    dark: false
  },
  {
    id: "elegant-dark",
    name: "Dark Elegante",
    description: "Escuro premium com contraste suave e legivel.",
    swatches: ["#111827", "#8b5cf6", "#38bdf8", "#1f2937"],
    dark: true
  },
  {
    id: "minimal-neutral",
    name: "Neutro Minimalista",
    description: "Discreto, corporativo e com pouca saturacao.",
    swatches: ["#374151", "#94a3b8", "#f8fafc", "#ffffff"],
    dark: false
  },
  {
    id: "modern-purple",
    name: "Roxo Moderno",
    description: "Leve, expressivo e com detalhes em lilas.",
    swatches: ["#7c3aed", "#a855f7", "#f7f2ff", "#ffffff"],
    dark: false
  }
];

export const defaultPaletteId = palettes[0].id;

export function getPalette(paletteId) {
  return palettes.find((palette) => palette.id === paletteId) ?? palettes[0];
}

export function getStoredPaletteId() {
  if (typeof window === "undefined") return defaultPaletteId;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return getPalette(stored).id;
}

export function applyPalette(paletteId) {
  if (typeof document === "undefined") return getPalette(paletteId).id;
  const palette = getPalette(paletteId);
  document.documentElement.dataset.theme = palette.id;
  document.documentElement.style.colorScheme = palette.dark ? "dark" : "light";
  return palette.id;
}

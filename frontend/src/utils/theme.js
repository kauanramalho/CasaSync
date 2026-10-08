export const THEME_STORAGE_KEY = "casasync_palette";

export const palettes = [
  {
    id: "professional-blue",
    name: "Azul Profissional",
    description: "Claro, moderno e confiavel para a rotina da casa.",
    swatches: ["#1d4ed8", "#1e40af", "#f8fbff", "#ffffff"],
    themeColor: "#f8fbff",
    dark: false
  },
  {
    id: "nature-green",
    name: "Verde Natureza",
    description: "Calmo, acolhedor e com destaques naturais.",
    swatches: ["#166534", "#0f766e", "#f3fbf5", "#ffffff"],
    themeColor: "#f3fbf5",
    dark: false
  },
  {
    id: "elegant-dark",
    name: "Dark Elegante",
    description: "Escuro premium com contraste suave e legivel.",
    swatches: ["#c4b5fd", "#7dd3fc", "#0f172a", "#111827"],
    themeColor: "#111827",
    dark: true
  },
  {
    id: "gpt-dark",
    name: "GPT Escuro",
    description: "Cinza-grafite, superfícies neutras e contraste limpo, inspirado no GPT.",
    swatches: ["#f5f5f5", "#d4d4d4", "#212121", "#303030"],
    themeColor: "#212121",
    dark: true
  },
  {
    id: "minimal-neutral",
    name: "Neutro Minimalista",
    description: "Discreto, corporativo e com pouca saturacao.",
    swatches: ["#374151", "#475569", "#f8fafc", "#ffffff"],
    themeColor: "#f8fafc",
    dark: false
  },
  {
    id: "modern-purple",
    name: "Roxo Moderno",
    description: "Leve, expressivo e com detalhes em lilas.",
    swatches: ["#6d28d9", "#9333ea", "#f9f5ff", "#ffffff"],
    themeColor: "#f9f5ff",
    dark: false
  }
];

export const defaultPaletteId = palettes[0].id;
export const ICON_RELEASE = "20261008";

export function getPalette(paletteId) {
  return palettes.find((palette) => palette.id === paletteId) ?? palettes[0];
}

export function getPaletteAssets(paletteId) {
  const base = `/icons/themes/${getPalette(paletteId).id}`;
  return {
    icon: `${base}/icon-192.png?v=${ICON_RELEASE}`,
    apple: `${base}/apple-touch-icon.png?v=${ICON_RELEASE}`,
    favicon: `${base}/favicon.svg?v=${ICON_RELEASE}`,
    manifest: `${base}/site.webmanifest?v=${ICON_RELEASE}`,
  };
}

export function getStoredPaletteId() {
  if (typeof window === "undefined") return defaultPaletteId;
  try {
    return getPalette(window.localStorage.getItem(THEME_STORAGE_KEY)).id;
  } catch {
    return defaultPaletteId;
  }
}

export function persistPalette(paletteId) {
  const id = getPalette(paletteId).id;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
    return true;
  } catch {
    // Restricted browser storage must not prevent changing the current theme.
    return false;
  }
}

export function applyPalette(paletteId) {
  if (typeof document === "undefined") return getPalette(paletteId).id;
  const palette = getPalette(paletteId);
  document.documentElement.dataset.theme = palette.id;
  document.documentElement.dataset.themeMode = palette.dark ? "dark" : "light";
  document.documentElement.style.colorScheme = palette.dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", palette.themeColor);
  const assets = getPaletteAssets(palette.id);
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", assets.apple);
  document.querySelector('link[rel="manifest"]')?.setAttribute("href", assets.manifest);
  document.querySelectorAll('link[rel="icon"], link[rel="alternate icon"]').forEach((link) => {
    const svg = link.getAttribute("type") === "image/svg+xml";
    link.setAttribute("href", svg ? assets.favicon : assets.icon);
    if (!svg) {
      link.setAttribute("type", "image/png");
      link.setAttribute("sizes", "192x192");
    }
  });
  return palette.id;
}

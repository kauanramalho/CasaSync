export const colorPalettes = [
  {
    id: "pastel",
    label: "Pastel",
    colors: [
      { key: "rose", label: "Rosa", hex: "#fb7185" },
      { key: "peach", label: "Pessego", hex: "#ff9b73" },
      { key: "sky", label: "Ceu", hex: "#60a5fa" },
      { key: "mint", label: "Menta", hex: "#34d399" },
      { key: "lavender", label: "Lavanda", hex: "#9d7cf4" }
    ]
  },
  {
    id: "vibrant",
    label: "Vibrantes",
    colors: [
      { key: "pink", label: "Pink", hex: "#ec4899" },
      { key: "orange", label: "Laranja", hex: "#f97316" },
      { key: "amber", label: "Dourado", hex: "#f59e0b" },
      { key: "cyan", label: "Ciano", hex: "#06b6d4" },
      { key: "violet", label: "Violeta", hex: "#8b5cf6" }
    ]
  },
  {
    id: "neutral",
    label: "Neutras",
    colors: [
      { key: "slate", label: "Slate", hex: "#64748b" },
      { key: "zinc", label: "Zinc", hex: "#71717a" },
      { key: "stone", label: "Stone", hex: "#78716c" },
      { key: "charcoal", label: "Grafite", hex: "#334155" },
      { key: "cream", label: "Creme", hex: "#f6c68b" }
    ]
  },
  {
    id: "dark",
    label: "Dark",
    colors: [
      { key: "wine", label: "Vinho", hex: "#9f1239" },
      { key: "indigo", label: "Indigo", hex: "#4f46e5" },
      { key: "teal", label: "Teal", hex: "#0f766e" },
      { key: "emerald", label: "Esmeralda", hex: "#059669" },
      { key: "purple", label: "Roxo", hex: "#7e22ce" }
    ]
  },
  {
    id: "romantic",
    label: "Romanticas",
    colors: [
      { key: "blush", label: "Blush", hex: "#f85d8f" },
      { key: "coral", label: "Coral", hex: "#fb7185" },
      { key: "mauve", label: "Mauve", hex: "#c084fc" },
      { key: "butter", label: "Butter", hex: "#facc15" },
      { key: "garden", label: "Jardim", hex: "#22c55e" }
    ]
  }
];

export const iconOptions = [
  { key: "sparkles", label: "Geral" },
  { key: "book-open", label: "Estudo" },
  { key: "briefcase", label: "Trabalho" },
  { key: "dumbbell", label: "Academia" },
  { key: "code-2", label: "Programacao" },
  { key: "heart-pulse", label: "Saude" },
  { key: "wallet", label: "Dinheiro" },
  { key: "shopping-cart", label: "Mercado" },
  { key: "home", label: "Casa" },
  { key: "smile", label: "Lazer" },
  { key: "plane", label: "Viagem" },
  { key: "heart", label: "Casal" },
  { key: "landmark", label: "Igreja" },
  { key: "gamepad-2", label: "Jogos" },
  { key: "film", label: "Filmes" },
  { key: "music", label: "Musica" },
  { key: "paw-print", label: "Pets" },
  { key: "utensils", label: "Alimentacao" },
  { key: "graduation-cap", label: "Faculdade" },
  { key: "car", label: "Carro" },
  { key: "coffee", label: "Cafe" },
  { key: "calendar-heart", label: "Dates" },
  { key: "gift", label: "Presentes" },
  { key: "laptop", label: "Tecnologia" },
  { key: "leaf", label: "Bem-estar" },
  { key: "shirt", label: "Roupas" },
  { key: "clipboard-check", label: "Rotina" }
];

export function findColor(colorKey) {
  return colorPalettes.flatMap((palette) => palette.colors).find((color) => color.key === colorKey);
}

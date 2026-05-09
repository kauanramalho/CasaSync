import clsx from "clsx";
import { FolderPlus, Sparkles } from "lucide-react";

import { categoryIconMap } from "./Badges";
import { colorPalettes, findColor, iconOptions } from "../utils/categoryDesign";
import { getCategoryTone } from "../utils/tasks";

export function getPaletteIdForColor(colorKey, fallback = "pastel") {
  return colorPalettes.find((item) => item.colors.some((color) => color.key === colorKey))?.id || fallback;
}

export default function CategoryStylePicker({
  color,
  icon,
  activePalette,
  onPaletteChange,
  onColorChange,
  onIconChange,
  previewTitle = "Preview",
  previewHelper,
  showPreview = false
}) {
  const palette = colorPalettes.find((item) => item.id === activePalette) || colorPalettes[0];
  const selectedColor = findColor(color);
  const SelectedIcon = categoryIconMap[icon] ?? FolderPlus;

  return (
    <div className="space-y-5">
      {showPreview && (
        <div className={clsx("rounded-[24px] border p-4", getCategoryTone({ color }))}>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 shadow-card">
              <SelectedIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold">{previewTitle}</p>
              {previewHelper && <p className="text-sm opacity-80">{previewHelper}</p>}
              {!previewHelper && <p className="text-sm opacity-80">{selectedColor?.label || "Cor personalizada"}</p>}
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-sm font-bold text-ink">Paleta</p>
        <div className="flex flex-wrap gap-2">
          {colorPalettes.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPaletteChange?.(item.id)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-xs font-bold transition",
                activePalette === item.id ? "bg-rose-50 text-blush shadow-card" : "bg-white text-muted hover:bg-slate-50"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {palette.colors.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onColorChange?.(item.key)}
              className={clsx(
                "group grid aspect-square place-items-center rounded-2xl border bg-white transition hover:-translate-y-0.5",
                color === item.key ? "border-rose-300 shadow-card ring-4 ring-rose-100" : "border-slate-100"
              )}
              title={item.label}
            >
              <span className="h-7 w-7 rounded-full shadow-inner transition group-hover:scale-110" style={{ backgroundColor: item.hex }} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-bold text-ink">Icone</p>
        <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto pr-1">
          {iconOptions.map((option) => {
            const Icon = categoryIconMap[option.key] ?? Sparkles;
            const active = icon === option.key;
            return (
              <button
                key={option.key}
                type="button"
                title={option.label}
                onClick={() => onIconChange?.(option.key)}
                className={clsx(
                  "grid aspect-square place-items-center rounded-2xl border transition hover:-translate-y-0.5",
                  active ? "border-rose-300 bg-rose-50 text-blush shadow-card" : "border-slate-100 bg-white text-muted hover:bg-slate-50 hover:text-ink"
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


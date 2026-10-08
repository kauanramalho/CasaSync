import { useTheme } from "../hooks/useTheme";
import AppIcon from "./AppIcon";

export default function LogoMark({ compact = false, subtitle = "Minha familia" }) {
  const { paletteId } = useTheme();
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <AppIcon paletteId={paletteId} className="h-10 w-10 shadow-lg shadow-blush/10 sm:h-12 sm:w-12" />
      {!compact && (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <strong className="text-lg font-bold text-ink sm:text-xl">CasaSync</strong>
            <span className="hidden rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-500 sm:inline">BETA</span>
          </div>
          <p className="truncate text-xs text-muted sm:text-sm">{subtitle}</p>
        </div>
      )}
    </div>
  );
}

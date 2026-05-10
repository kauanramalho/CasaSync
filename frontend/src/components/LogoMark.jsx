import { HeartHandshake } from "lucide-react";

export default function LogoMark({ compact = false, subtitle = "Minha familia" }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blush/25 via-white to-lavender/25 shadow-lg shadow-blush/10">
        <HeartHandshake className="h-6 w-6 text-blush" />
      </div>
      {!compact && (
        <div>
          <div className="flex items-center gap-2">
            <strong className="text-xl font-bold text-ink">CasaSync</strong>
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-500">BETA</span>
          </div>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      )}
    </div>
  );
}

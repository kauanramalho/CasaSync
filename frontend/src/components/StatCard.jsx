import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import Card from "./Card";

export default function StatCard({ icon: Icon, label, value, hint, tone = "rose", emphasis = false, to, onClick, active = false, compact = false }) {
  const tones = {
    rose: "bg-rose-50 text-rose-500",
    orange: "bg-orange-50 text-orange-500",
    emerald: "bg-emerald-50 text-emerald-500",
    violet: "bg-violet-50 text-violet-500",
    blue: "bg-blue-50 text-blue-500"
  };

  return (
    <Card
      as={to ? Link : onClick ? "button" : "section"}
      to={to}
      type={onClick && !to ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick && !to ? active : undefined}
      className={`surface-hover relative flex w-full items-center gap-3 overflow-hidden text-left ${compact ? "min-h-[88px] !p-3 sm:min-h-[100px] sm:!p-4" : "min-h-[112px] gap-4 sm:min-h-[128px]"} ${to || onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blush/30" : ""} ${active ? "border-blush ring-2 ring-blush/25" : ""} ${emphasis ? "border-rose-200 bg-rose-50/55" : ""}`}
    >
      {emphasis && <span className={`absolute right-4 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_5px_rgb(244_63_94_/_0.10)] ${compact ? "bottom-4" : "top-4"}`} aria-hidden="true" />}
      <div className={`hidden shrink-0 place-items-center rounded-2xl shadow-card sm:grid ${compact ? "h-10 w-10" : "h-14 w-14"} ${tones[tone]}`} aria-hidden="true">
        <Icon className={compact ? "h-5 w-5" : "h-7 w-7"} />
      </div>
      <div className="min-w-0">
        <p className={`font-medium text-muted ${compact ? "pr-3 text-xs sm:text-sm" : "text-sm"}`}>{label}</p>
        <p className={`mt-1 font-bold text-ink ${compact ? "text-2xl" : "text-3xl"}`}>{value}</p>
        {hint && <p className={`mt-2 text-xs text-muted sm:text-sm ${compact ? "hidden sm:block" : ""}`}>{hint}</p>}
      </div>
      {(to || onClick) && <ArrowUpRight className="absolute right-3 top-3 h-3.5 w-3.5 text-muted" aria-hidden="true" />}
    </Card>
  );
}

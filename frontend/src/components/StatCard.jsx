import Card from "./Card";

export default function StatCard({ icon: Icon, label, value, hint, tone = "rose", emphasis = false }) {
  const tones = {
    rose: "bg-rose-50 text-rose-500",
    orange: "bg-orange-50 text-orange-500",
    emerald: "bg-emerald-50 text-emerald-500",
    violet: "bg-violet-50 text-violet-500",
    blue: "bg-blue-50 text-blue-500"
  };

  return (
    <Card className={`surface-hover relative flex min-h-[112px] items-center gap-4 overflow-hidden sm:min-h-[128px] ${emphasis ? "border-rose-200 bg-rose-50/55" : ""}`}>
      {emphasis && <span className="absolute right-4 top-4 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_5px_rgb(244_63_94_/_0.10)]" aria-hidden="true" />}
      <div className={`hidden h-14 w-14 shrink-0 place-items-center rounded-2xl shadow-card sm:grid ${tones[tone]}`} aria-hidden="true">
        <Icon className="h-7 w-7" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted">{label}</p>
        <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
        {hint && <p className="mt-2 text-xs text-muted sm:text-sm">{hint}</p>}
      </div>
    </Card>
  );
}

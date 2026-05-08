import Card from "./Card";

export default function StatCard({ icon: Icon, label, value, hint, tone = "rose" }) {
  const tones = {
    rose: "bg-rose-50 text-rose-500",
    orange: "bg-orange-50 text-orange-500",
    emerald: "bg-emerald-50 text-emerald-500",
    violet: "bg-violet-50 text-violet-500",
    blue: "bg-blue-50 text-blue-500"
  };

  return (
    <Card className="flex min-h-[132px] items-center gap-4">
      <div className={`grid h-14 w-14 place-items-center rounded-2xl ${tones[tone]}`}>
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted">{label}</p>
        <p className="mt-1 text-3xl font-bold text-ink">{value}</p>
        {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
      </div>
    </Card>
  );
}


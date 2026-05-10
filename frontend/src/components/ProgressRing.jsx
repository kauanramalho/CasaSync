export default function ProgressRing({ value = 78, label }) {
  const normalizedValue = Math.max(0, Math.min(100, Number(value) || 0));
  const displayLabel = label ?? `${normalizedValue}%`;

  return (
    <div
      className="grid h-20 w-20 place-items-center rounded-full"
      style={{
        background: `conic-gradient(rgb(var(--color-blush)) ${normalizedValue * 3.6}deg, rgb(var(--color-blush) / 0.14) ${normalizedValue * 3.6}deg)`
      }}
    >
      <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-sm font-bold text-ink">{displayLabel}</div>
    </div>
  );
}

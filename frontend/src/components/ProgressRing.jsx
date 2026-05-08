export default function ProgressRing({ value = 78, label = "78%" }) {
  return (
    <div
      className="grid h-20 w-20 place-items-center rounded-full"
      style={{ background: `conic-gradient(#f85d8f ${value * 3.6}deg, #ffe7df ${value * 3.6}deg)` }}
    >
      <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-sm font-bold text-ink">{label}</div>
    </div>
  );
}


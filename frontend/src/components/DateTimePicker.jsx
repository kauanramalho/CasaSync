import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const displayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

function parseLocalDateTime(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 9), Number(match[5] ?? 0));
}

function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sameDay(left, right) {
  return Boolean(
    left &&
      right &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate()
  );
}

function buildMonthDays(viewDate) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function DateTimePicker({ value, onChange, placeholder = "dd/mm/aaaa --:--" }) {
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate ?? new Date());
  const [popoverStyle, setPopoverStyle] = useState(null);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => buildMonthDays(viewDate), [viewDate]);

  useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    function handleClick(event) {
      if (!wrapperRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 16;
      const gap = 10;
      const width = Math.min(380, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
      const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
      const roomAbove = rect.top - viewportPadding;
      const openAbove = roomBelow < 430 && roomAbove > roomBelow;
      const maxHeight = Math.max(360, Math.min(520, openAbove ? roomAbove - gap : roomBelow - gap));
      const top = openAbove ? Math.max(viewportPadding, rect.top - maxHeight - gap) : rect.bottom + gap;
      setPopoverStyle({ left, top, width, maxHeight });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function commitDate(date) {
    const base = selectedDate ?? new Date();
    const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), base.getHours() || 9, base.getMinutes() || 0);
    onChange?.(formatLocalDateTime(nextDate));
  }

  function changeTime(part, rawValue) {
    const base = selectedDate ?? new Date();
    const nextDate = new Date(base);
    if (!selectedDate) nextDate.setHours(9, 0, 0, 0);
    const numeric = Number.parseInt(rawValue, 10);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    if (part === "hour") nextDate.setHours(clamp(safeValue, 0, 23));
    if (part === "minute") nextDate.setMinutes(clamp(safeValue, 0, 59));
    onChange?.(formatLocalDateTime(nextDate));
  }

  function moveMonth(direction) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function chooseToday() {
    const now = new Date();
    setViewDate(now);
    onChange?.(formatLocalDateTime(now));
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "soft-input flex min-h-[48px] items-center gap-3 pl-4 text-left",
          open && "border-blush/60 ring-4 ring-blush/10"
        )}
      >
        <CalendarClock className="h-5 w-5 shrink-0 text-muted" />
        <span className={clsx("min-w-0 flex-1 truncate font-semibold", selectedDate ? "text-ink" : "text-muted")}>
          {selectedDate ? displayFormatter.format(selectedDate) : placeholder}
        </span>
        {selectedDate && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onChange?.("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onChange?.("");
              }
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted hover:bg-blush/10 hover:text-blush"
            aria-label="Limpar prazo"
          >
            <X className="h-4 w-4" />
          </span>
        )}
      </button>

      {open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="fixed z-[110] overflow-y-auto rounded-[26px] border border-white/80 bg-white/95 p-4 shadow-soft backdrop-blur-xl animate-in"
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted transition hover:bg-blush/10 hover:text-blush"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="text-sm font-bold capitalize text-ink">{monthFormatter.format(viewDate)}</p>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted transition hover:bg-blush/10 hover:text-blush"
                aria-label="Proximo mes"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wide text-muted">
              {weekdays.map((weekday) => (
                <span key={weekday} className="py-1">
                  {weekday}
                </span>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((day) => {
                const outsideMonth = day.getMonth() !== viewDate.getMonth();
                const selected = sameDay(day, selectedDate);
                const isToday = sameDay(day, today);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => commitDate(day)}
                    className={clsx(
                      "grid h-10 place-items-center rounded-2xl text-sm font-bold transition",
                      selected && "bg-blush text-white shadow-card",
                      !selected && isToday && "bg-blush/10 text-blush",
                      !selected && !isToday && !outsideMonth && "text-ink hover:bg-blush/10 hover:text-blush",
                      !selected && outsideMonth && "text-muted/55 hover:bg-slate-50"
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-100 bg-slate-50/70 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
                <Clock3 className="h-4 w-4 text-blush" />
                Horario
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">Hora</span>
                  <input
                    className="soft-input text-center text-base font-bold"
                    inputMode="numeric"
                    value={pad((selectedDate ?? new Date(0, 0, 1, 9)).getHours())}
                    onChange={(event) => changeTime("hour", event.target.value)}
                  />
                </label>
                <span className="pt-5 text-xl font-bold text-muted">:</span>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">Minuto</span>
                  <input
                    className="soft-input text-center text-base font-bold"
                    inputMode="numeric"
                    value={pad((selectedDate ?? new Date(0, 0, 1, 9)).getMinutes())}
                    onChange={(event) => changeTime("minute", event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button type="button" onClick={() => onChange?.("")} className="rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-slate-50 hover:text-ink">
                Limpar
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={chooseToday} className="rounded-2xl px-3 py-2 text-sm font-bold text-blush hover:bg-blush/10">
                  Hoje
                </button>
                <button type="button" onClick={() => setOpen(false)} className="rounded-2xl bg-blush px-4 py-2 text-sm font-bold text-white shadow-card">
                  Aplicar
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

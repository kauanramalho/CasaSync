import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, Minus, Plus, X } from "lucide-react";

import { useAppPreferences } from "../hooks/useAppPreferences";
import { buildMonthDays, getWeekdayLabels } from "../utils/preferences";

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

function parseLocalDateTime(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 9), Number(match[5] ?? 0));
}

function formatLocalDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseManualTime(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return { hour, minute, label: `${pad(hour)}:${pad(minute)}` };
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

function TimeSpinner({ label, value, onIncrement }) {
  return (
    <div className="rounded-[20px] border border-slate-100 bg-white/80 p-2 shadow-sm">
      <span className="mb-1 block text-center text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <div className="grid grid-cols-[32px_1fr_32px] items-center gap-1">
        <button
          type="button"
          onClick={() => onIncrement(-1)}
          className="grid h-8 w-8 place-items-center rounded-xl text-muted transition hover:bg-blush/10 hover:text-blush"
          aria-label={`Diminuir ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="grid h-10 place-items-center rounded-2xl bg-blush/10 text-lg font-black tabular-nums text-blush">{pad(value)}</span>
        <button
          type="button"
          onClick={() => onIncrement(1)}
          className="grid h-8 w-8 place-items-center rounded-xl text-muted transition hover:bg-blush/10 hover:text-blush"
          aria-label={`Aumentar ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function DateTimePicker({ value, onChange, placeholder = "dd/mm/aaaa --:--" }) {
  const { preferences } = useAppPreferences();
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate ?? new Date());
  const [timeInput, setTimeInput] = useState(() => (selectedDate ? `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}` : ""));
  const [timeError, setTimeError] = useState("");
  const [popoverStyle, setPopoverStyle] = useState(null);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const weekdays = useMemo(() => getWeekdayLabels(preferences.weekStart), [preferences.weekStart]);
  const days = useMemo(() => buildMonthDays(viewDate, preferences.weekStart), [viewDate, preferences.weekStart]);

  useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    setTimeInput(selectedDate ? `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}` : "");
    setTimeError("");
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
      setPopoverStyle({
        left,
        top,
        width,
        maxHeight,
        overflowX: "hidden",
        overflowY: maxHeight < 470 ? "auto" : "visible"
      });
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

  function incrementTime(part, amount) {
    const base = selectedDate ?? new Date();
    const nextDate = new Date(base);
    if (!selectedDate) nextDate.setHours(9, 0, 0, 0);
    if (part === "hour") nextDate.setHours((nextDate.getHours() + amount + 24) % 24);
    if (part === "minute") nextDate.setMinutes((nextDate.getMinutes() + amount + 60) % 60);
    setTimeError("");
    onChange?.(formatLocalDateTime(nextDate));
  }

  function commitManualTime() {
    if (!timeInput.trim()) {
      setTimeError("");
      return;
    }

    const parsed = parseManualTime(timeInput);
    if (!parsed) {
      setTimeError("Informe um horario valido, como 08:30.");
      return;
    }

    const base = selectedDate ?? new Date();
    const nextDate = new Date(base);
    if (!selectedDate) nextDate.setSeconds(0, 0);
    nextDate.setHours(parsed.hour, parsed.minute, 0, 0);
    setTimeInput(parsed.label);
    setTimeError("");
    onChange?.(formatLocalDateTime(nextDate));
  }

  function moveMonth(direction) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function chooseToday() {
    const now = new Date();
    setViewDate(now);
    setTimeError("");
    onChange?.(formatLocalDateTime(now));
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={clsx(
          "soft-input flex min-h-[48px] items-center gap-1 p-0",
          open && "border-blush/60 ring-4 ring-blush/10"
        )}
      >
        <button ref={buttonRef} type="button" onClick={() => setOpen((current) => !current)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
          <CalendarClock className="h-5 w-5 shrink-0 text-muted" />
          <span className={clsx("min-w-0 flex-1 truncate font-semibold", selectedDate ? "text-ink" : "text-muted")}>
            {selectedDate ? displayFormatter.format(selectedDate) : placeholder}
          </span>
        </button>
        {selectedDate && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setTimeInput("");
              setTimeError("");
              onChange?.("");
            }}
            className="mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-blush/10 hover:text-blush"
            aria-label="Limpar prazo"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="fixed z-[110] rounded-[26px] border border-white/80 bg-white/95 p-4 shadow-soft backdrop-blur-xl animate-in"
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
              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">Digite o horario</span>
                <input
                  className={clsx("soft-input bg-white/90 text-center font-black tabular-nums", timeError && "border-rose-300 text-rose-700 ring-4 ring-rose-100")}
                  inputMode="text"
                  placeholder="08:30"
                  value={timeInput}
                  onChange={(event) => {
                    setTimeInput(event.target.value);
                    setTimeError("");
                  }}
                  onBlur={commitManualTime}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitManualTime();
                    }
                  }}
                  aria-invalid={Boolean(timeError)}
                />
                {timeError && <span className="mt-2 block rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{timeError}</span>}
              </label>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <TimeSpinner label="Hora" value={(selectedDate ?? new Date(0, 0, 1, 9)).getHours()} onIncrement={(amount) => incrementTime("hour", amount)} />
                <span className="pt-6 text-xl font-bold text-muted">:</span>
                <TimeSpinner label="Minuto" value={(selectedDate ?? new Date(0, 0, 1, 9)).getMinutes()} onIncrement={(amount) => incrementTime("minute", amount)} />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setTimeInput("");
                  setTimeError("");
                  onChange?.("");
                }}
                className="rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-slate-50 hover:text-ink"
              >
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

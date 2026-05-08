import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";

export default function SelectMenu({ value, options = [], onChange, placeholder = "Selecionar", className, buttonClassName }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);

  useEffect(() => {
    function handleClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function choose(option) {
    onChange?.(option.value);
    setOpen(false);
  }

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "soft-input flex min-h-[48px] items-center justify-between gap-3 text-left",
          open && "border-rose-300 ring-4 ring-rose-100",
          buttonClassName
        )}
      >
        <span className="min-w-0">
          <span className={clsx("block truncate font-semibold", selectedOption ? "text-ink" : "text-muted")}>{selectedOption?.label || placeholder}</span>
          {selectedOption?.helper && <span className="mt-0.5 block truncate text-xs font-medium text-muted">{selectedOption.helper}</span>}
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 text-muted transition", open && "rotate-180 text-blush")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-72 overflow-y-auto rounded-[22px] border border-white/80 bg-white/95 p-2 shadow-soft backdrop-blur-xl animate-in">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || option.label}
                type="button"
                onClick={() => choose(option)}
                className={clsx(
                  "flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition",
                  active ? "bg-rose-50 text-blush" : "text-ink hover:bg-slate-50"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  {option.helper && <span className="mt-0.5 block truncate text-xs font-medium text-muted">{option.helper}</span>}
                </span>
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

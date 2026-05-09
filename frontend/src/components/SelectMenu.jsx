import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";

import { CategoryOptionContent } from "./Badges";

export default function SelectMenu({ value, options = [], onChange, placeholder = "Selecionar", className, buttonClassName }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);

  useEffect(() => {
    function handleClick(event) {
      if (!ref.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
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
      const gap = 8;
      const viewportPadding = 16;
      const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
      const roomAbove = rect.top - viewportPadding;
      const openAbove = roomBelow < 220 && roomAbove > roomBelow;
      const availableHeight = Math.max(160, Math.min(288, openAbove ? roomAbove - gap : roomBelow - gap));
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
      const top = openAbove ? Math.max(viewportPadding, rect.top - availableHeight - gap) : Math.min(window.innerHeight - viewportPadding, rect.bottom + gap);

      setMenuStyle({
        left,
        top,
        width,
        maxHeight: availableHeight
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

  function choose(option) {
    onChange?.(option.value);
    setOpen(false);
  }

  function hasCategoryVisual(option) {
    return Boolean(option?.category || option?.color || option?.icon);
  }

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "soft-input flex min-h-[48px] items-center justify-between gap-3 text-left",
          open && "border-blush/55 ring-4 ring-blush/10",
          buttonClassName
        )}
      >
        {selectedOption && hasCategoryVisual(selectedOption) ? (
          <CategoryOptionContent option={selectedOption} active />
        ) : (
          <span className="min-w-0">
            <span className={clsx("block truncate font-semibold", selectedOption ? "text-ink" : "text-muted")}>{selectedOption?.label || placeholder}</span>
            {selectedOption?.helper && <span className="mt-0.5 block truncate text-xs font-medium text-muted">{selectedOption.helper}</span>}
          </span>
        )}
        <ChevronDown className={clsx("h-4 w-4 shrink-0 text-muted transition", open && "rotate-180 text-blush")} />
      </button>

      {open &&
        menuStyle &&
        createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="fixed z-[100] overflow-y-auto rounded-[22px] border border-white/80 bg-white/95 p-2 shadow-soft backdrop-blur-xl animate-in"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value || option.label}
                type="button"
                onClick={() => choose(option)}
                className={clsx(
                  "flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition",
                  active ? "bg-blush/10 text-blush" : "text-ink hover:bg-slate-50"
                )}
              >
                {hasCategoryVisual(option) ? (
                  <CategoryOptionContent option={option} active={active} />
                ) : (
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.helper && <span className="mt-0.5 block truncate text-xs font-medium text-muted">{option.helper}</span>}
                  </span>
                )}
                {active && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

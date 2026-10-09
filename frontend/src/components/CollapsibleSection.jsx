import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

// A null choice follows the data-driven default until the user toggles it.
export default function CollapsibleSection({ title, icon: Icon, count, defaultOpen = false, children, lazy = false }) {
  const contentId = useId();
  const [choice, setChoice] = useState(null);
  const expanded = choice ?? defaultOpen;

  return (
    <section className="min-w-0" data-collapsible-section>
      <h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setChoice(!expanded)}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-ink transition hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blush/30 sm:px-4 sm:text-base"
        >
          {Icon && <Icon className="h-5 w-5 shrink-0 text-blush" aria-hidden="true" />}
          <span className="min-w-0 flex-1 break-words">{title}</span>
          {count !== undefined && <span className="shrink-0 rounded-full bg-surface-soft px-2.5 py-1 text-xs text-muted">{count}</span>}
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      <div id={contentId} hidden={!expanded} className="min-w-0 px-3 pb-3 sm:px-4 sm:pb-4">
        {(!lazy || expanded) && children}
      </div>
    </section>
  );
}

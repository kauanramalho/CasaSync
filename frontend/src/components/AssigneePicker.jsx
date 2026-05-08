import clsx from "clsx";
import { Check } from "lucide-react";

import Avatar from "./Avatar";

export default function AssigneePicker({ members = [], value = [], onChange }) {
  const selected = new Set(value);

  function toggle(userId) {
    const next = selected.has(userId)
      ? value.filter((item) => item !== userId)
      : [...value, userId];
    onChange?.(next);
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {members.map((member) => {
        const active = selected.has(member.user_id);
        return (
          <button
            key={member.user_id}
            type="button"
            onClick={() => toggle(member.user_id)}
            className={clsx(
              "flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition",
              active ? "border-rose-200 bg-rose-50 text-ink" : "border-slate-100 bg-white/80 text-muted hover:border-blue-100 hover:bg-blue-50/50"
            )}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Avatar user={member.user} size="sm" />
              <span className="truncate text-sm font-semibold">{member.user.name}</span>
            </span>
            <span
              className={clsx(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                active ? "border-blush bg-blush text-white" : "border-slate-200 bg-white text-transparent"
              )}
            >
              <Check className="h-4 w-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}


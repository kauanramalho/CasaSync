import { useId } from "react";

// Shared compact opt-in. Never turns on sync just because a panel opens.
export default function GoogleCalendarOptIn({ checked, onChange, canSync, hasDateTime = true, busy = false, plural = false }) {
  const helperId = useId();
  const available = Boolean(canSync && hasDateTime);
  const helper = !canSync ? "Conecte a agenda em Configurações." : !hasDateTime ? "Defina data e horário." : "";
  return (
    <div className="min-w-0">
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink">
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-blue-600" checked={checked}
          onChange={(event) => onChange(event.target.checked)} disabled={!available || busy}
          aria-describedby={helper ? helperId : undefined} />
        {plural ? "Adicionar tarefas ao Google Agenda" : "Adicionar ao Google Agenda"}
      </label>
      {helper && <p id={helperId} className="pl-6 text-xs text-muted">{helper}</p>}
    </div>
  );
}

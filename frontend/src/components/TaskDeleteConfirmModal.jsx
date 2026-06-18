import { useEffect, useState } from "react";
import { CalendarX2, Loader2, Trash2, X } from "lucide-react";

import Button from "./Button";

function hasGoogleCalendarEvent(task) {
  return Boolean(task?.google_calendar_event_id);
}

export default function TaskDeleteConfirmModal({ task, deleting = false, onCancel, onConfirm }) {
  const showGoogleOption = hasGoogleCalendarEvent(task);
  const [deleteGoogleEvent, setDeleteGoogleEvent] = useState(false);

  useEffect(() => {
    setDeleteGoogleEvent(showGoogleOption);
  }, [showGoogleOption, task?.id]);

  useEffect(() => {
    if (!task) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !deleting) onCancel?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleting, onCancel, task]);

  if (!task) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-slate-900/30 px-2 py-2 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-delete-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-t-[26px] border border-white/80 bg-white shadow-soft animate-in sm:rounded-[26px]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-black uppercase text-rose-600">
              <Trash2 className="h-3.5 w-3.5" />
              Exclusao definitiva
            </span>
            <h2 id="task-delete-title" className="mt-3 text-2xl font-black text-ink">
              Excluir tarefa?
            </h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-muted">
              A tarefa <span className="font-black text-ink">"{task.title}"</span> sera removida do CasaSync e nao aparecera no Dashboard, Tarefas ou Calendario.
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={deleting} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-50 text-muted transition hover:text-ink disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {showGoogleOption ? (
            <label className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4 text-sm font-bold text-blue-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                checked={deleteGoogleEvent}
                disabled={deleting}
                onChange={(event) => setDeleteGoogleEvent(event.target.checked)}
              />
              <span>
                <span className="flex items-center gap-2">
                  <CalendarX2 className="h-4 w-4" />
                  Apagar tambem do Google Agenda
                </span>
                <span className="mt-1 block text-xs font-semibold text-blue-700/80">
                  Se o Google Agenda falhar, a tarefa fica salva para evitar dessincronizacao silenciosa.
                </span>
              </span>
            </label>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm font-semibold text-muted">
              Esta tarefa nao possui evento vinculado ao Google Agenda.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-white/90 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onCancel} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            className="w-full sm:w-auto"
            onClick={() => onConfirm?.({ deleteGoogleEvent })}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            {deleting ? "Excluindo..." : "Excluir tarefa"}
          </Button>
        </div>
      </div>
    </div>
  );
}

import clsx from "clsx";
import { localCalendarDateKey } from "../utils/calendar";
import { getCategorySemanticStyle } from "../utils/tasks";

// One responsive month grid; day and event controls are siblings, never nested buttons.
export default function MonthCalendarGrid({ days, baseDate, weekdayLabels, tasksByDay, selectedDate, onOpenDay, onOpenTask, onPreview, onPreviewLeave, timeLabel }) {
  const todayKey = localCalendarDateKey(new Date());
  const selectedKey = selectedDate ? localCalendarDateKey(selectedDate) : "";

  return (
    <section className="min-w-0" aria-label="Calendário mensal" data-month-grid>
      <div className="calendar-weekday-row grid grid-cols-7">
        {weekdayLabels.map((label) => <span key={label} className="min-w-0 py-2 text-center text-[10px] font-semibold text-muted sm:py-3 sm:text-sm">{label}</span>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = localCalendarDateKey(day);
          const rows = tasksByDay[key] || [];
          const currentMonth = day.getMonth() === baseDate.getMonth();
          const label = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(day);
          return (
            <div key={key} data-calendar-day={key} className={clsx("calendar-day-cell relative min-h-[112px] min-w-0 border-b border-r p-0.5 sm:min-h-[150px] sm:p-2", currentMonth ? "calendar-day-current" : "calendar-day-outside", selectedKey === key && "calendar-day-selected")}>
              <button type="button" onClick={() => onOpenDay(day)} aria-label={`${label}, ${rows.length} ${rows.length === 1 ? "tarefa" : "tarefas"}. Ver dia`} aria-current={todayKey === key ? "date" : undefined} className="absolute inset-0 rounded-sm transition hover:bg-blush/5 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blush" />
              <span aria-hidden="true" className={clsx("pointer-events-none relative mx-auto mb-1 grid h-7 w-7 place-items-center rounded-full text-xs font-semibold sm:ml-0 sm:h-8 sm:w-8 sm:text-sm", todayKey === key ? "bg-blush text-white" : currentMonth ? "text-ink" : "calendar-day-number-outside")}>{day.getDate()}</span>
              <div className="pointer-events-none relative space-y-1">
                {rows.slice(0, 3).map((task, index) => (
                  <button key={task.id} type="button" onClick={(event) => { event.stopPropagation(); onOpenTask(task); }} onMouseEnter={(event) => onPreview?.(task, event)} onMouseLeave={onPreviewLeave} aria-label={`Ver detalhes de ${task.title}`} title={`${task.title} · ${task.status}`} className={clsx("pointer-events-auto block min-h-8 w-full min-w-0 rounded-md border px-1 py-1 text-left text-[10px] font-semibold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush sm:text-xs", index === 2 && "hidden sm:block", task.status === "concluida" && "line-through opacity-65", task.status === "atrasada" && "ring-1 ring-rose-400/70")} style={getCategorySemanticStyle(task.category, "pill")}>
                    <span className="block truncate">{task.status === "atrasada" && <span aria-hidden="true">! </span>}{task.title}</span>
                    <span className="hidden truncate text-[10px] opacity-80 sm:block">{timeLabel?.(task.due_date)}</span>
                  </button>
                ))}
                {rows.length > 2 && <button type="button" onClick={() => onOpenDay(day)} aria-label={`Ver as ${rows.length} tarefas de ${label}`} className="pointer-events-auto block min-h-6 w-full truncate rounded text-left text-[10px] font-bold text-blush sm:hidden">+{rows.length - 2}</button>}
                {rows.length > 3 && <button type="button" onClick={() => onOpenDay(day)} aria-label={`Ver as ${rows.length} tarefas de ${label}`} className="pointer-events-auto hidden min-h-6 w-full text-left text-xs font-bold text-blush sm:block">+{rows.length - 3} {rows.length - 3 === 1 ? "tarefa" : "tarefas"}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

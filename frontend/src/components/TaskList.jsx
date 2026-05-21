import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, BellRing, Check, Edit3, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

import AssigneeStack from "./AssigneeStack";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./Badges";
import { formatDate } from "../utils/formatters";
import { formatReminderLead } from "../utils/taskReminders";
import { getNextTaskSort, sortTasksForDisplay, taskSortColumns } from "../utils/tasks";

function SortHeaderButton({ column, activeSort, onSort }) {
  const active = activeSort?.key === column.key;
  const direction = activeSort?.direction === "desc" ? "desc" : "asc";
  const Icon = active ? (direction === "desc" ? ArrowDown : ArrowUp) : ArrowDownUp;
  const directionLabel = direction === "desc" ? "decrescente" : "crescente";

  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      className={`group inline-flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1 text-left text-sm font-bold transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 ${
        active ? "text-ink" : "text-muted"
      }`}
      title={`Ordenar por ${column.label}`}
      aria-label={`Ordenar por ${column.label}${active ? `, ${directionLabel}` : ""}`}
    >
      <span className="truncate">{column.label}</span>
      <Icon className={`h-3.5 w-3.5 shrink-0 transition ${active ? "text-blush" : "text-slate-300 group-hover:text-muted"}`} />
    </button>
  );
}

function TaskRow({ task, compact, menuOpen, onToggleMenu, onRunAction, onComplete, onEdit, onDelete, onRemoveRecent }) {
  const hasActiveReminder =
    task.reminder_enabled &&
    !task.reminder_sent &&
    task.reminder_value &&
    task.reminder_unit &&
    ["pendente", "em_andamento"].includes(task.status);

  return (
    <div
      className="grid min-w-0 gap-3 px-4 py-4 transition hover:bg-rose-50/40 md:grid-cols-[44px_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_44px] md:items-center md:gap-4 md:px-5"
    >
      <button
        onClick={() => onComplete?.(task)}
        className={`grid h-6 w-6 place-items-center rounded-md border transition ${
          task.status === "concluida" ? "border-emerald-400 bg-emerald-400 text-white" : "border-slate-300 text-transparent hover:border-emerald-300"
        }`}
        title={task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
      >
        <Check className="h-4 w-4" />
      </button>
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{task.title}</p>
        {!compact && (
          <p className="mt-1 text-xs text-muted">
            Criado por {task.creator?.name || "CasaSync"} &middot; {task.status === "concluida" ? "Concluida" : "Prazo"}: {formatDate(task.due_date)}
          </p>
        )}
        {hasActiveReminder && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-600">
            <BellRing className="h-3 w-3" />
            Lembrete: {formatReminderLead(task.reminder_value, task.reminder_unit)}
          </span>
        )}
      </div>
      <CategoryBadge category={task.category} className="w-full min-w-0 justify-start" />
      <div className="min-w-0">
        <AssigneeStack task={task} />
      </div>
      <div className="min-w-0">
        <PriorityBadge priority={task.priority} />
      </div>
      <span className="min-w-0 text-sm text-muted">{formatDate(task.due_date)}</span>
      <div className="min-w-0">
        <StatusBadge status={task.status} />
      </div>
      <div className="relative justify-self-start md:justify-self-auto" data-task-menu-root>
        <button
          onClick={() => onToggleMenu(task.id)}
          className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-slate-100"
          title="Acoes da tarefa"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-9 z-30 w-52 overflow-hidden rounded-2xl border border-slate-100 bg-white p-1 shadow-card animate-in md:left-auto md:right-0">
            {onEdit && (
              <button onClick={() => onRunAction(onEdit, task)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-blue-50">
                <Edit3 className="h-4 w-4 text-blue-500" />
                Editar tarefa
              </button>
            )}
            <button onClick={() => onRunAction(onComplete, task)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-emerald-50">
              <RotateCcw className="h-4 w-4 text-emerald-500" />
              {task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
            </button>
            {onRemoveRecent && (
              <button onClick={() => onRunAction(onRemoveRecent, task)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />
                Remover das recentes
              </button>
            )}
            {onDelete && (
              <button onClick={() => onRunAction(onDelete, task)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />
                Excluir tarefa
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const MemoTaskRow = memo(TaskRow);

function TaskList({ tasks = [], onComplete, onEdit, onDelete, onRemoveRecent, compact = false, emptyMessage = "Nenhuma tarefa encontrada." }) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [activeSort, setActiveSort] = useState(null);
  const orderedTasks = useMemo(() => sortTasksForDisplay(tasks, activeSort), [tasks, activeSort]);

  const changeSort = useCallback(function changeSort(columnKey) {
    setActiveSort((current) => getNextTaskSort(current, columnKey));
  }, []);

  const setMobileSortColumn = useCallback(function setMobileSortColumn(columnKey) {
    if (!columnKey) {
      setActiveSort(null);
      return;
    }
    setActiveSort((current) => (current?.key === columnKey ? current : { key: columnKey, direction: "asc" }));
  }, []);

  const toggleMobileSortDirection = useCallback(function toggleMobileSortDirection() {
    setActiveSort((current) => (current?.key ? { key: current.key, direction: current.direction === "desc" ? "asc" : "desc" } : current));
  }, []);

  const toggleMenu = useCallback(function toggleMenu(taskId) {
    setOpenMenuId((current) => (current === taskId ? null : taskId));
  }, []);

  const runAction = useCallback(function runAction(action, task) {
    setOpenMenuId(null);
    action?.(task);
  }, []);

  useEffect(() => {
    if (!openMenuId) return undefined;
    function handlePointerDown(event) {
      if (!event.target.closest("[data-task-menu-root]")) setOpenMenuId(null);
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  return (
    <div className="min-w-0 overflow-hidden rounded-[24px] border border-slate-100 bg-white/70">
      <div className="border-b border-slate-100 px-4 py-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <select
            className="soft-input min-w-0 flex-1 py-2 text-sm font-semibold"
            value={activeSort?.key || ""}
            onChange={(event) => setMobileSortColumn(event.target.value)}
            aria-label="Ordenar tarefas"
          >
            <option value="">Padrao</option>
            {taskSortColumns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleMobileSortDirection}
            disabled={!activeSort?.key}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-100 bg-white text-muted transition hover:border-blush/25 hover:bg-rose-50 hover:text-blush disabled:cursor-not-allowed disabled:opacity-45"
            title="Inverter ordenacao"
            aria-label="Inverter ordenacao"
          >
            {activeSort?.direction === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="hidden min-w-0 grid-cols-[44px_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_44px] gap-4 border-b border-slate-100 px-5 py-4 text-sm font-medium text-muted md:grid">
        <span />
        {taskSortColumns.map((column) => (
          <SortHeaderButton key={column.key} column={column} activeSort={activeSort} onSort={changeSort} />
        ))}
        <span />
      </div>
      <div className="max-h-[620px] divide-y divide-slate-100 overflow-x-hidden overflow-y-auto">
        {orderedTasks.map((task) => (
          <MemoTaskRow
            key={task.id}
            task={task}
            compact={compact}
            menuOpen={openMenuId === task.id}
            onToggleMenu={toggleMenu}
            onRunAction={runAction}
            onComplete={onComplete}
            onEdit={onEdit}
            onDelete={onDelete}
            onRemoveRecent={onRemoveRecent}
          />
        ))}
        {orderedTasks.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">{emptyMessage}</div>}
      </div>
    </div>
  );
}

export default memo(TaskList);

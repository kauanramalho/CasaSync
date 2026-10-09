import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, BellRing, Check, Edit3, EyeOff, MoreHorizontal, Paperclip, RotateCcw, Trash2 } from "lucide-react";

import AssigneeStack from "./AssigneeStack";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./Badges";
import SelectMenu from "./SelectMenu";
import { formatDate } from "../utils/formatters";
import { formatReminderList, normalizeReminderList } from "../utils/taskReminders";
import { getAssigneeNames, getNextTaskSort, sortTasksForDisplay, taskSortColumns } from "../utils/tasks";

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

function CompleteTaskButton({ task, onComplete, className = "" }) {
  return (
    <button
      type="button"
      data-task-row-action
      onClick={() => onComplete?.(task)}
      className={`grid shrink-0 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 ${
        task.status === "concluida" ? "border-emerald-400 bg-emerald-400 text-white" : "border-slate-300 text-transparent hover:border-emerald-300"
      } ${className}`}
      title={task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
      aria-label={task.status === "concluida" ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
    >
      <Check className="h-4 w-4" />
    </button>
  );
}

function TaskActionMenu({
  task,
  menuOpen,
  onToggleMenu,
  onRunAction,
  onComplete,
  onEdit,
  onDelete,
  onRemoveRecent,
  buttonClassName = "h-10 w-10",
  menuClassName = "right-0 top-11"
}) {
  return (
    <div className="relative shrink-0" data-task-menu-root data-task-row-action>
      <button
        type="button"
        onClick={() => onToggleMenu(task.id)}
        className={`grid place-items-center rounded-xl text-muted transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 ${buttonClassName}`}
        title="Acoes da tarefa"
        aria-label={`Acoes de ${task.title}`}
        aria-expanded={menuOpen}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {menuOpen && (
        <div className={`absolute z-30 w-[min(13rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-100 bg-white p-1 shadow-card animate-in ${menuClassName}`}>
          {onEdit && (
            <button type="button" onClick={() => onRunAction(onEdit, task)} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-blue-50">
              <Edit3 className="h-4 w-4 text-blue-500" />
              Editar tarefa
            </button>
          )}
          <button type="button" onClick={() => onRunAction(onComplete, task)} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-emerald-50">
            <RotateCcw className="h-4 w-4 text-emerald-500" />
            {task.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"}
          </button>
          {onRemoveRecent && (
            <button type="button" onClick={() => onRunAction(onRemoveRecent, task)} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50">
              <EyeOff className="h-4 w-4" />
              Ocultar das recentes
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => onRunAction(onDelete, task)} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" />
              Excluir tarefa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, compact, menuOpen, onToggleMenu, onRunAction, onComplete, onEdit, onDelete, onRemoveRecent, onOpenDetails }) {
  const attachmentCount = task.attachments?.length || 0;
  const reminderSummary = formatReminderList(normalizeReminderList(task));
  const hasActiveReminder = Boolean(reminderSummary && !task.reminder_sent && ["pendente", "em_andamento"].includes(task.status));
  const clickable = Boolean(onOpenDetails);

  function openDetails(event) {
    if (!clickable || event.target.closest("[data-task-row-action]")) return;
    onOpenDetails(task);
  }

  function openDetailsFromKeyboard(event) {
    if (!clickable || event.target.closest("[data-task-row-action]")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetails(task);
    }
  }

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Ver detalhes de ${task.title}` : undefined}
      onClick={openDetails}
      onKeyDown={openDetailsFromKeyboard}
      className={`min-w-0 px-3 py-3 transition hover:bg-rose-50/40 md:px-0 md:py-0 ${
        clickable ? "cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100" : ""
      }`}
    >
      <div className="md:hidden" data-compact-task>
        <div className="flex min-w-0 items-start gap-2">
          <CompleteTaskButton task={task} onComplete={onComplete} className="mt-0.5 h-11 w-11" />
          <div className="min-w-0 flex-1">
            <p className={`line-clamp-2 break-words text-sm font-semibold leading-snug text-ink ${task.status === "concluida" ? "line-through opacity-75" : ""}`}>{task.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span>{formatDate(task.due_date, "Sem prazo")}</span>
              <StatusBadge status={task.status} />
              {hasActiveReminder && <span title={`Lembrete: ${reminderSummary}`} aria-label={`Lembrete: ${reminderSummary}`}><BellRing className="h-3.5 w-3.5 text-blue-500" /></span>}
              {attachmentCount > 0 && <span title={`${attachmentCount} anexos`} aria-label={`${attachmentCount} anexos`} className="inline-flex items-center gap-0.5"><Paperclip className="h-3.5 w-3.5" />{attachmentCount}</span>}
            </div>
          </div>
          <TaskActionMenu
            task={task}
            menuOpen={menuOpen}
            onToggleMenu={onToggleMenu}
            onRunAction={onRunAction}
            onComplete={onComplete}
            onEdit={onEdit}
            onDelete={onDelete}
            onRemoveRecent={onRemoveRecent}
            buttonClassName="h-11 w-11"
            menuClassName="right-0 top-12"
          />
        </div>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 pl-[52px]">
          <CategoryBadge category={task.category} compact className="min-w-0 max-w-full" />
          <span className="shrink-0" title={getAssigneeNames(task)} aria-label={`Responsáveis: ${getAssigneeNames(task)}`}><AssigneeStack task={task} showName={false} max={2} emptyText="" /></span>
        </div>
      </div>

      <div className="hidden min-w-0 grid-cols-[44px_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_44px] gap-3 px-4 py-3 md:grid md:items-center">
        <CompleteTaskButton task={task} onComplete={onComplete} className="h-10 w-10" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{task.title}</p>
          {!compact && <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            {hasActiveReminder && <span title={`Lembrete: ${reminderSummary}`} aria-label={`Lembrete: ${reminderSummary}`}><BellRing className="h-3.5 w-3.5 text-blue-500" /></span>}
            {attachmentCount > 0 && <span className="inline-flex items-center gap-1" aria-label={`${attachmentCount} anexos`}><Paperclip className="h-3.5 w-3.5" />{attachmentCount}</span>}
          </div>}
        </div>
        <CategoryBadge category={task.category} compact className="w-full min-w-0 justify-start" />
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
        <TaskActionMenu
          task={task}
          menuOpen={menuOpen}
          onToggleMenu={onToggleMenu}
          onRunAction={onRunAction}
          onComplete={onComplete}
          onEdit={onEdit}
          onDelete={onDelete}
          onRemoveRecent={onRemoveRecent}
          menuClassName="right-0 top-11"
        />
      </div>
    </div>
  );
}

const MemoTaskRow = memo(TaskRow);

function TaskList({ tasks = [], onComplete, onEdit, onDelete, onRemoveRecent, onOpenDetails, compact = false, emptyMessage = "Nenhuma tarefa encontrada." }) {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [activeSort, setActiveSort] = useState(null);
  const orderedTasks = useMemo(() => sortTasksForDisplay(tasks, activeSort), [tasks, activeSort]);
  const mobileSortOptions = useMemo(() => [{ value: "", label: "Padrao" }, ...taskSortColumns.map((column) => ({ value: column.key, label: column.label }))], []);

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
    <div className="min-w-0 overflow-hidden rounded-[22px] border border-slate-100 bg-white/70 sm:rounded-[24px]">
      <div className="border-b border-slate-100 px-4 py-3 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <SelectMenu
            className="min-w-0 flex-1"
            buttonClassName="min-h-11 py-2 text-sm"
            value={activeSort?.key || ""}
            onChange={setMobileSortColumn}
            options={mobileSortOptions}
            placeholder="Ordenar tarefas"
          />
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
      <div className="hidden min-w-0 grid-cols-[44px_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_44px] gap-3 border-b border-slate-100 px-4 py-3 text-sm font-medium text-muted md:grid">
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
            onOpenDetails={onOpenDetails}
          />
        ))}
        {orderedTasks.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">{emptyMessage}</div>}
      </div>
    </div>
  );
}

export default memo(TaskList);

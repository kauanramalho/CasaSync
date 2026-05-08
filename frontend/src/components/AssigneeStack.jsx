import clsx from "clsx";

import Avatar from "./Avatar";
import { getAssigneeNames, getTaskAssignees } from "../utils/tasks";

export default function AssigneeStack({ task, max = 4, showName = true, size = "sm", className, emptyText = "Sem responsável" }) {
  const assignees = getTaskAssignees(task);
  if (!assignees.length) return <span className={clsx("text-sm font-medium text-muted", className)}>{emptyText}</span>;

  return (
    <div className={clsx("flex min-w-0 items-center gap-2 text-sm font-medium text-ink", className)}>
      <div className="flex -space-x-2">
        {assignees.slice(0, max).map((assignee) => (
          <Avatar key={assignee.id} user={assignee} size={size} />
        ))}
      </div>
      {showName && <span className="truncate">{getAssigneeNames(task)}</span>}
    </div>
  );
}

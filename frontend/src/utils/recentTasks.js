const HIDDEN_RECENT_TASKS_KEY = "casasync_hidden_recent_tasks";

function readHiddenRecentTaskIds() {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_RECENT_TASKS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function getHiddenRecentTaskIds() {
  return readHiddenRecentTaskIds();
}

export function hideRecentTask(taskId) {
  const next = Array.from(new Set([...readHiddenRecentTaskIds(), taskId]));
  localStorage.setItem(HIDDEN_RECENT_TASKS_KEY, JSON.stringify(next));
  return next;
}


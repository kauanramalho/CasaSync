import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./useAuth";
import { tasksApi } from "../services/api";
import { APP_DATA_CHANGED_EVENT } from "../utils/events";
import { formatReminderMessageLead } from "../utils/taskReminders";

const STORAGE_KEY = "casasync_notifications";
const REMINDER_CHECK_INTERVAL_MS = 30_000;
const REMINDER_GRACE_MS = 2 * 60_000;
const NotificationsContext = createContext(null);

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readNotifications() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveNotifications(notifications) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(() => readNotifications());

  const updateNotifications = useCallback((updater) => {
    setNotifications((current) => {
      const next = updater(current);
      saveNotifications(next);
      return next;
    });
  }, []);

  const addNotification = useCallback(({ title, description, type = "info", actor, dedupe_key, family_id, user_id }) => {
    updateNotifications((current) => {
      if (dedupe_key && current.some((item) => item.dedupe_key === dedupe_key)) return current;
      return [
        {
          id: createId(),
          dedupe_key,
          title,
          description,
          type,
          actor,
          family_id,
          user_id: user_id ?? user?.id,
          read: false,
          created_at: new Date().toISOString()
        },
        ...current
      ].slice(0, 80);
    });
  }, [updateNotifications, user?.id]);

  const markAsRead = useCallback((id) => {
    updateNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }, [updateNotifications]);

  const clearAll = useCallback(() => {
    updateNotifications((current) => {
      if (!user?.id) return [];
      return current.filter((item) => item.user_id && item.user_id !== user.id);
    });
  }, [updateNotifications, user?.id]);

  const markAllAsRead = useCallback(() => {
    updateNotifications((current) =>
      current.map((item) => (!user?.id || !item.user_id || item.user_id === user.id ? { ...item, read: true } : item))
    );
  }, [updateNotifications, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

    function userCanSeeTask(task) {
      const assigneeIds = task.assignee_ids?.length
        ? task.assignee_ids
        : task.assignee_id
          ? [task.assignee_id]
          : task.assignees?.map((assignee) => assignee.id).filter(Boolean) || [];
      return assigneeIds.includes(user.id) || task.creator_id === user.id;
    }

    function formatDueDate(value) {
      if (!value) return "";
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    }

    async function markReminderSent(task) {
      try {
        await tasksApi.update(task.id, { reminder_sent: true });
      } catch {
        // The reminder will be checked again on the next refresh if the task still exists.
      }
    }

    async function checkTaskReminders() {
      try {
        const tasks = await tasksApi.remindersDue();
        if (!alive) return;
        const now = Date.now();

        tasks
          .filter((task) => task.reminder_enabled && task.reminder_at && !task.reminder_sent)
          .filter((task) => ["pendente", "em_andamento"].includes(task.status))
          .filter(userCanSeeTask)
          .forEach((task) => {
            const reminderAt = new Date(task.reminder_at).getTime();
            const age = now - reminderAt;
            if (age < 0) return;

            if (age <= REMINDER_GRACE_MS) {
              const lead = formatReminderMessageLead(task.reminder_value, task.reminder_unit);
              const due = formatDueDate(task.due_date);
              addNotification({
                title: "Lembrete de tarefa",
                description: `Em ${lead} voce tem: ${task.title}.${due ? ` Prazo: ${due}.` : ""}`,
                type: "reminder",
                family_id: task.family_id,
                user_id: user.id,
                dedupe_key: `task-reminder:${user.id}:${task.id}:${task.reminder_at}`
              });
            }

            markReminderSent(task);
          });
      } catch {
        // Usuarios sem familia ou sessoes expiradas ja sao tratados nas telas principais.
      }
    }

    checkTaskReminders();
    const interval = window.setInterval(checkTaskReminders, REMINDER_CHECK_INTERVAL_MS);
    window.addEventListener(APP_DATA_CHANGED_EVENT, checkTaskReminders);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener(APP_DATA_CHANGED_EVENT, checkTaskReminders);
    };
  }, [addNotification, user?.id]);

  const value = useMemo(() => {
    const visibleNotifications = user?.id
      ? notifications.filter((item) => !item.user_id || item.user_id === user.id)
      : notifications;
    const unreadCount = visibleNotifications.filter((item) => !item.read).length;
    return { notifications: visibleNotifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll };
  }, [notifications, addNotification, markAsRead, markAllAsRead, clearAll, user?.id]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }
  return context;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./useAuth";
import { notificationsApi } from "../services/api";
import { APP_DATA_CHANGED_EVENT } from "../utils/events";

const STORAGE_KEY = "casasync_notifications";
const REMINDER_CHECK_INTERVAL_MS = 60_000;
const NotificationsContext = createContext(null);

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readLocalNotifications() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveLocalNotifications(notifications) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

function normalizeServerNotification(item) {
  return {
    ...item,
    source: "server",
    description: item.description || "",
    actor: null
  };
}

function normalizeLocalNotification(item) {
  return { ...item, source: item.source || "local" };
}

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [localNotifications, setLocalNotifications] = useState(() => readLocalNotifications().map(normalizeLocalNotification));
  const [serverNotifications, setServerNotifications] = useState([]);

  const updateLocalNotifications = useCallback((updater) => {
    setLocalNotifications((current) => {
      const next = updater(current);
      saveLocalNotifications(next);
      return next;
    });
  }, []);

  const refreshServerNotifications = useCallback(async ({ processReminders = false } = {}) => {
    if (!user?.id) {
      setServerNotifications([]);
      return;
    }
    if (processReminders) {
      await notificationsApi.processReminders();
    }
    const rows = await notificationsApi.list();
    setServerNotifications(rows.map(normalizeServerNotification));
  }, [user?.id]);

  const addNotification = useCallback(({ title, description, type = "info", actor, dedupe_key, family_id, user_id }) => {
    updateLocalNotifications((current) => {
      if (dedupe_key && current.some((item) => item.dedupe_key === dedupe_key)) return current;
      return [
        {
          id: createId(),
          source: "local",
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
  }, [updateLocalNotifications, user?.id]);

  const markAsRead = useCallback((itemOrId) => {
    const notification = typeof itemOrId === "object" ? itemOrId : null;
    const id = notification?.id || itemOrId;
    if (notification?.source === "server") {
      setServerNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
      notificationsApi.markRead(id).catch(() => refreshServerNotifications());
      return;
    }
    updateLocalNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }, [refreshServerNotifications, updateLocalNotifications]);

  const markAllAsRead = useCallback(() => {
    updateLocalNotifications((current) =>
      current.map((item) => (!user?.id || !item.user_id || item.user_id === user.id ? { ...item, read: true } : item))
    );
    setServerNotifications((current) => current.map((item) => ({ ...item, read: true })));
    if (user?.id) notificationsApi.markAllRead().catch(() => refreshServerNotifications());
  }, [refreshServerNotifications, updateLocalNotifications, user?.id]);

  const clearAll = useCallback(() => {
    updateLocalNotifications((current) => {
      if (!user?.id) return [];
      return current.filter((item) => item.user_id && item.user_id !== user.id);
    });
    setServerNotifications([]);
    if (user?.id) notificationsApi.clearAll().catch(() => refreshServerNotifications());
  }, [refreshServerNotifications, updateLocalNotifications, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setServerNotifications([]);
      return undefined;
    }
    let alive = true;

    async function sync({ processReminders = false } = {}) {
      try {
        if (!alive) return;
        await refreshServerNotifications({ processReminders });
      } catch {
        // Main screens already handle expired sessions or missing family context.
      }
    }

    sync({ processReminders: true });
    const interval = window.setInterval(() => sync({ processReminders: true }), REMINDER_CHECK_INTERVAL_MS);
    const handleAppDataChanged = () => sync({ processReminders: true });
    window.addEventListener(APP_DATA_CHANGED_EVENT, handleAppDataChanged);
    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener(APP_DATA_CHANGED_EVENT, handleAppDataChanged);
    };
  }, [refreshServerNotifications, user?.id]);

  const value = useMemo(() => {
    const visibleLocalNotifications = user?.id
      ? localNotifications.filter((item) => !item.user_id || item.user_id === user.id)
      : localNotifications;
    const notifications = [...serverNotifications, ...visibleLocalNotifications].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
    const unreadCount = notifications.filter((item) => !item.read).length;
    return { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll, refresh: refreshServerNotifications };
  }, [addNotification, clearAll, localNotifications, markAllAsRead, markAsRead, refreshServerNotifications, serverNotifications, user?.id]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }
  return context;
}

import { createContext, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "casasync_notifications";
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
  const [notifications, setNotifications] = useState(() => readNotifications());

  function updateNotifications(updater) {
    setNotifications((current) => {
      const next = updater(current);
      saveNotifications(next);
      return next;
    });
  }

  function addNotification({ title, description, type = "info", actor }) {
    updateNotifications((current) => [
      {
        id: createId(),
        title,
        description,
        type,
        actor,
        read: false,
        created_at: new Date().toISOString()
      },
      ...current
    ].slice(0, 80));
  }

  function markAsRead(id) {
    updateNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  function clearAll() {
    updateNotifications(() => []);
  }

  function markAllAsRead() {
    updateNotifications((current) => current.map((item) => ({ ...item, read: true })));
  }

  const value = useMemo(() => {
    const unreadCount = notifications.filter((item) => !item.read).length;
    return { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, clearAll };
  }, [notifications]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }
  return context;
}

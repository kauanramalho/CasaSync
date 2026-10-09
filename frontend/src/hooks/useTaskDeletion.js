import { useCallback, useRef, useState } from "react";

import { useAuth } from "./useAuth";
import { useNotifications } from "./useNotifications";
import { useToast } from "./useToast";
import { tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";

export default function useTaskDeletion({ onDeleted, onError } = {}) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { showToast } = useToast();
  const [pendingTask, setPendingTask] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const deletingRef = useRef(false);

  const requestTaskDelete = useCallback((task) => {
    if (!task?.id || deletingRef.current) return;
    setPendingTask(task);
  }, []);

  const cancelTaskDelete = useCallback(() => {
    if (deletingRef.current) return;
    setPendingTask(null);
  }, []);

  const confirmTaskDelete = useCallback(async ({ deleteGoogleEvent = false } = {}) => {
    if (!pendingTask?.id || deletingRef.current) return { ok: false };
    deletingRef.current = true;
    setDeletingTaskId(pendingTask.id);
    try {
      const response = await tasksApi.delete(pendingTask.id, { deleteGoogleEvent });
      onDeleted?.(pendingTask, response);
      addNotification({
        title: response?.google_calendar_event_deleted ? "Tarefa e evento excluidos" : "Tarefa excluida",
        description: response?.message || `${pendingTask.title} saiu da lista da casa.`,
        type: "task",
        actor: user?.name
      });
      showToast({ type: "success", message: response?.message || "Tarefa excluida." });
      emitAppDataChanged();
      setPendingTask(null);
      return { ok: true, response };
    } catch (err) {
      const message = normalizeApiError(err);
      onError?.(message, pendingTask);
      showToast({ type: "error", message });
      return { ok: false, error: message };
    } finally {
      deletingRef.current = false;
      setDeletingTaskId("");
    }
  }, [addNotification, onDeleted, onError, pendingTask, showToast, user?.name]);

  return {
    pendingDeleteTask: pendingTask,
    deletingTaskId,
    requestTaskDelete,
    cancelTaskDelete,
    confirmTaskDelete
  };
}

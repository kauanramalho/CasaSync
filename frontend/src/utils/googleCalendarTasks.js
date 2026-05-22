import { integrationsApi, tasksApi } from "../services/api";
import { normalizeApiError } from "./formatters";


export function hasGoogleCalendarDateTime(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text);
}


export async function syncTaskToGoogleCalendarSafely(taskId) {
  try {
    const response = await integrationsApi.syncGoogleCalendarTask(taskId);
    let task = null;
    if (response.synced) {
      try {
        task = await tasksApi.retrieve(taskId);
      } catch {
        task = null;
      }
    }
    return {
      ok: Boolean(response.synced),
      response,
      task,
      message: response.message || "Google Agenda processado."
    };
  } catch (error) {
    return {
      ok: false,
      response: null,
      task: null,
      message: normalizeApiError(error) || "Nao foi possivel sincronizar com o Google Agenda."
    };
  }
}

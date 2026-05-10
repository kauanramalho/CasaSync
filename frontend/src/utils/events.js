export const APP_DATA_CHANGED_EVENT = "casasync:data-changed";
export const AUTH_SESSION_CHANGED_EVENT = "casasync:auth-session-changed";

export function emitAppDataChanged() {
  window.dispatchEvent(new Event(APP_DATA_CHANGED_EVENT));
}

export function emitAuthSessionChanged() {
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

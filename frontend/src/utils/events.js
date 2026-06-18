export const APP_DATA_CHANGED_EVENT = "casasync:data-changed";
export const APP_RESUMED_EVENT = "casasync:app-resumed";
export const AUTH_SESSION_CHANGED_EVENT = "casasync:auth-session-changed";
export const ACTIVE_FAMILY_CHANGED_EVENT = "casasync:active-family-changed";

export function emitAppDataChanged() {
  window.dispatchEvent(new Event(APP_DATA_CHANGED_EVENT));
}

export function emitAppResumed() {
  window.dispatchEvent(new Event(APP_RESUMED_EVENT));
}

export function emitAuthSessionChanged() {
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export function emitActiveFamilyChanged(familyId) {
  window.dispatchEvent(new CustomEvent(ACTIVE_FAMILY_CHANGED_EVENT, { detail: { familyId } }));
  emitAppDataChanged();
}

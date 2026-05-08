export const APP_DATA_CHANGED_EVENT = "casasync:data-changed";

export function emitAppDataChanged() {
  window.dispatchEvent(new Event(APP_DATA_CHANGED_EVENT));
}


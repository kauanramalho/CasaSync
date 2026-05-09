import { useEffect, useMemo, useState } from "react";

import { getStoredPreferences, PREFERENCES_STORAGE_KEY, saveStoredPreferences } from "../utils/preferences";

export function useAppPreferences() {
  const [preferences, setPreferences] = useState(getStoredPreferences);

  useEffect(() => {
    function syncPreferences(event) {
      setPreferences(event.detail || getStoredPreferences());
    }

    function syncStorage(event) {
      if (event.key === PREFERENCES_STORAGE_KEY) setPreferences(getStoredPreferences());
    }

    window.addEventListener("casasync:preferences-changed", syncPreferences);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener("casasync:preferences-changed", syncPreferences);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  return useMemo(
    () => ({
      preferences,
      updatePreference(key, value) {
        setPreferences(saveStoredPreferences({ [key]: value }));
      },
      updatePreferences(next) {
        setPreferences(saveStoredPreferences(next));
      }
    }),
    [preferences]
  );
}

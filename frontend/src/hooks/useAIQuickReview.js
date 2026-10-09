import { useEffect, useState } from "react";
import { AI_IMPORT_PREFERENCE_EVENT, aiImportPreferenceKey, readAIQuickReview, saveAIQuickReview } from "../utils/aiImportPreferences";

export default function useAIQuickReview(userId) {
  const [state, setState] = useState(() => ({ userId, enabled: readAIQuickReview(userId) }));
  useEffect(() => {
    const refresh = () => setState({ userId, enabled: readAIQuickReview(userId) });
    const onStorage = (event) => { if (!event.key || event.key === aiImportPreferenceKey(userId)) refresh(); };
    const onPreference = (event) => { if (event.detail?.userId === userId) refresh(); };
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(AI_IMPORT_PREFERENCE_EVENT, onPreference);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AI_IMPORT_PREFERENCE_EVENT, onPreference);
    };
  }, [userId]);
  const update = (enabled) => {
    const saved = saveAIQuickReview(userId, enabled);
    if (saved) setState({ userId, enabled });
    return saved;
  };
  return { enabled: state.userId === userId && state.enabled, update };
}

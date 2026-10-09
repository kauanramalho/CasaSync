export const AI_IMPORT_PREFERENCE_EVENT = "casasync:ai-import-preference-changed";
export function aiImportPreferenceKey(userId) {
  return userId ? `casasync_ai_quick_review:${userId}` : null;
}
export function readAIQuickReview(userId, storage) {
  const key = aiImportPreferenceKey(userId);
  if (!key) return false;
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    return JSON.parse(target?.getItem(key) || "false") === true;
  } catch {
    return false;
  }
}
export function saveAIQuickReview(userId, enabled, storage) {
  const key = aiImportPreferenceKey(userId);
  if (!key || typeof enabled !== "boolean") return false;
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!target) return false;
    target.setItem(key, JSON.stringify(enabled));
    if (target.getItem(key) !== JSON.stringify(enabled)) return false;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AI_IMPORT_PREFERENCE_EVENT, { detail: { userId } }));
    }
    return true;
  } catch {
    return false;
  }
}

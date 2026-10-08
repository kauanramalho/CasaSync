const stacks = new WeakMap();
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function activateDialog(root, onClose, { modal = true } = {}) {
  if (!root) return () => {};
  const doc = root.ownerDocument;
  let state = stacks.get(doc);
  if (!state) { state = { dialogs: [], overflow: "" }; stacks.set(doc, state); }
  const previous = doc.activeElement;
  const entry = { root, modal };
  if (modal && !state.dialogs.some((dialog) => dialog.modal)) {
    state.overflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
  }
  state.dialogs.push(entry);
  const isTop = () => state.dialogs.at(-1) === entry;
  const items = () => [...root.querySelectorAll(focusableSelector)].filter((node) => node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[hidden], [inert], [aria-hidden="true"]'));
  const focusFirst = () => (items().find((node) => node.getAttribute("aria-selected") === "true") || items()[0] || root).focus();
  focusFirst();
  const handleKey = (event) => {
    if (!isTop()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose?.();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = items();
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!nodes.length || !root.contains(doc.activeElement) || (event.shiftKey ? doc.activeElement === first : doc.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  };
  const handleFocus = (event) => { if (isTop() && modal && !root.contains(event.target)) focusFirst(); };
  doc.addEventListener("keydown", handleKey, true);
  doc.addEventListener("focusin", handleFocus);
  return () => {
    const wasTop = isTop();
    doc.removeEventListener("keydown", handleKey, true);
    doc.removeEventListener("focusin", handleFocus);
    state.dialogs = state.dialogs.filter((dialog) => dialog !== entry);
    if (modal && !state.dialogs.some((dialog) => dialog.modal)) doc.body.style.overflow = state.overflow;
    if (wasTop && previous?.isConnected) previous.focus();
  };
}

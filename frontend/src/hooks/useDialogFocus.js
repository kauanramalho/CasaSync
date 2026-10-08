import { useEffect, useRef } from "react";
import { activateDialog } from "../utils/dialogFocus.js";

// Shared keyboard and scroll behavior for modal drawers/editors.
export default function useDialogFocus(ref, open, onClose, { modal = true } = {}) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    return activateDialog(ref.current, () => closeRef.current?.(), { modal });
  }, [ref, open, modal]);
}

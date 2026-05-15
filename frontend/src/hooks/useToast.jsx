import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

const ToastContext = createContext(null);
const toastIcons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info
};

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast) => {
    const id = createId();
    const duration = toast.duration ?? 4200;
    setToasts((current) => [
      ...current.filter((item) => item.message !== toast.message || item.type !== toast.type),
      { id, type: "info", ...toast }
    ].slice(-4));
    if (duration > 0) {
      window.setTimeout(() => dismissToast(id), duration);
    }
    return id;
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[160] flex flex-col items-center gap-3 px-4 sm:items-end">
        {toasts.map((toast) => {
          const Icon = toastIcons[toast.type] || toastIcons.info;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[22px] border px-4 py-3 shadow-soft backdrop-blur-xl animate-in ${
                toast.type === "error"
                  ? "border-rose-200/80 bg-rose-50/95 text-rose-700"
                  : toast.type === "success"
                    ? "border-emerald-200/80 bg-emerald-50/95 text-emerald-700"
                    : "border-slate-200/80 bg-white/95 text-ink"
              }`}
              role="status"
              aria-live={toast.type === "error" ? "assertive" : "polite"}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                {toast.title && <p className="text-sm font-black text-ink">{toast.title}</p>}
                <p className="text-sm font-semibold leading-relaxed">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-xl text-current/70 transition hover:bg-white/60 hover:text-current"
                aria-label="Fechar mensagem"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}

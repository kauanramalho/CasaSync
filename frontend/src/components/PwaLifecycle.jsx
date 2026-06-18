import { RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { emitAppResumed } from "../utils/events";
import { registerCasaSyncServiceWorker } from "../utils/pushNotifications";

const RESUME_REFRESH_AFTER_MS = 60_000;
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export default function PwaLifecycle() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorker = useRef(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return undefined;

    let active = true;
    let hiddenAt = document.hidden ? Date.now() : 0;
    let registration = null;
    const currentBundlePath = document.querySelector('script[type="module"]')?.getAttribute("src") || "";

    const offerUpdate = (worker) => {
      if (active && navigator.serviceWorker.controller && worker?.state === "installed") {
        waitingWorker.current = worker;
        setUpdateAvailable(true);
      }
    };

    const watchInstallingWorker = (worker) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => offerUpdate(worker));
    };

    const checkForUpdate = async () => {
      registration?.update().catch(() => undefined);
      try {
        const response = await fetch("/", { cache: "no-store", headers: { Accept: "text/html" } });
        if (!response.ok) return;
        const html = await response.text();
        const publishedDocument = new DOMParser().parseFromString(html, "text/html");
        const publishedBundlePath = publishedDocument.querySelector('script[type="module"]')?.getAttribute("src") || "";
        if (active && currentBundlePath && publishedBundlePath && publishedBundlePath !== currentBundlePath) {
          setUpdateAvailable(true);
        }
      } catch {
        // Being offline is an expected PWA state; the next check retries normally.
      }
    };
    const handleControllerChange = () => {
      if (updateRequested.current) window.location.reload();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= RESUME_REFRESH_AFTER_MS) emitAppResumed();
      hiddenAt = 0;
      checkForUpdate();
    };
    const handleOnline = () => {
      emitAppResumed();
      checkForUpdate();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    registerCasaSyncServiceWorker()
      .then((nextRegistration) => {
        if (!active) return;
        registration = nextRegistration;
        if (registration.waiting) offerUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => watchInstallingWorker(registration.installing));
      })
      .catch(() => undefined);

    const interval = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!updateAvailable) return null;

  function applyUpdate() {
    updateRequested.current = true;
    if (waitingWorker.current) {
      waitingWorker.current.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    window.location.reload();
  }

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[170] mx-auto flex max-w-lg items-center gap-3 rounded-[22px] border border-lavender/60 bg-white/95 p-3 text-ink shadow-soft backdrop-blur-xl" role="status" aria-live="polite">
      <RefreshCw className="h-5 w-5 shrink-0 text-blush" />
      <p className="min-w-0 flex-1 text-sm font-semibold">Nova versao do CasaSync disponivel.</p>
      <button type="button" onClick={applyUpdate} className="min-h-10 shrink-0 rounded-xl bg-blush px-3 text-xs font-bold text-white">
        Atualizar
      </button>
      <button type="button" onClick={() => setUpdateAvailable(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-lavender/20" aria-label="Atualizar depois">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

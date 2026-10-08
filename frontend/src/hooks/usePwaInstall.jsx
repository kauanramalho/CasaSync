import { createContext, useContext, useEffect, useRef, useState } from "react";
import { getInstallPlatform, isStandalone, promptNativeInstall } from "../utils/pwaInstall";

const InstallContext = createContext(null);

export function PwaInstallProvider({ children }) {
  const [installed, setInstalled] = useState(() => isStandalone({ navigator, matchMedia: window.matchMedia?.bind(window) }));
  const [platform] = useState(() => getInstallPlatform(navigator));
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [installing, setInstalling] = useState(false);
  const deferredPrompt = useRef(null);
  const prompting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const media = window.matchMedia?.("(display-mode: standalone)");
    const fullscreen = window.matchMedia?.("(display-mode: fullscreen)");
    function syncDisplayMode() {
      setInstalled(isStandalone({ navigator, matchMedia: window.matchMedia?.bind(window) }));
    }
    function capturePrompt(event) {
      // iOS has no programmatic installer; its guide uses the browser menu.
      if (platform === "ios" || isStandalone({ navigator, matchMedia: window.matchMedia?.bind(window) })) return;
      event.preventDefault();
      deferredPrompt.current = event;
      setPromptAvailable(true);
    }
    function onInstalled() {
      deferredPrompt.current = null;
      setPromptAvailable(false);
      setInstalled(true);
    }
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", onInstalled);
    for (const query of [media, fullscreen]) {
      if (query?.addEventListener) query.addEventListener("change", syncDisplayMode);
      else query?.addListener?.(syncDisplayMode);
    }
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", onInstalled);
      for (const query of [media, fullscreen]) {
        if (query?.removeEventListener) query.removeEventListener("change", syncDisplayMode);
        else query?.removeListener?.(syncDisplayMode);
      }
    };
  }, [platform]);

  async function install() {
    if (prompting.current) return "busy";
    const event = deferredPrompt.current;
    if (!event) return "unavailable";
    deferredPrompt.current = null;
    prompting.current = true;
    setPromptAvailable(false);
    setInstalling(true);
    try {
      // Called directly by a button click; do not defer the user gesture.
      return await promptNativeInstall(event);
    } catch {
      return "unavailable";
    } finally {
      prompting.current = false;
      if (mounted.current) setInstalling(false);
    }
  }

  return <InstallContext.Provider value={{ installed, platform, promptAvailable, installing, install }}>{children}</InstallContext.Provider>;
}

export function usePwaInstall() {
  const context = useContext(InstallContext);
  if (!context) throw new Error("usePwaInstall precisa estar dentro de PwaInstallProvider.");
  return context;
}

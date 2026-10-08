import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Share, Smartphone, X } from "lucide-react";
import Button from "./Button";
import useDialogFocus from "../hooks/useDialogFocus";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { getInstallGuide } from "../utils/pwaInstall";

export default function InstallApp({ compact = false }) {
  const { installed, platform, promptAvailable, installing, install } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState(platform);
  const [message, setMessage] = useState("");
  const dialogRef = useRef(null);
  const titleId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDialogFocus(dialogRef, open && !installed, close);
  const guide = getInstallGuide(guidePlatform);

  if (installed) return null;

  async function handleInstall() {
    setMessage("");
    if (promptAvailable) {
      const outcome = await install();
      if (outcome === "accepted") { setMessage("Instalação solicitada. Aguarde o navegador e procure o ícone do CasaSync."); return; }
      if (outcome === "busy") return;
    }
    setGuidePlatform(platform);
    setOpen(true);
  }

  return (
    <>
      <div className={compact ? "text-ink" : "rounded-2xl border border-lavender/40 bg-white/60 p-4 text-ink"}>
        {!compact && <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-blush" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">CasaSync na sua Tela de Início</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Abra pelo ícone, como um aplicativo, no iPhone, iPad ou Android.</p>
          </div>
        </div>}
        <button type="button" className={`${compact ? "" : "mt-3"} flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blush/10 px-3 py-2 text-sm font-bold text-blush hover:bg-blush/20`} disabled={installing} onClick={() => void handleInstall()}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {installing ? "Aguarde..." : platform === "ios" ? "Instalar no iPhone ou iPad" : "Instalar aplicativo"}
        </button>
        {platform !== "ios" && <button type="button" className="mt-2 min-h-11 w-full rounded-xl px-3 py-2 text-xs font-bold text-blush underline underline-offset-4" onClick={() => { setGuidePlatform(platform); setOpen(true); }}>
          Ver passo a passo para instalar
        </button>}
        {message && <p role="status" className="mt-3 text-sm text-muted">{message}</p>}
      </div>
      {open && createPortal(
        <div className="fixed inset-0 z-[180] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-5" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="theme-surface relative max-h-[85vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-[24px] border border-lavender/40 p-5 text-ink shadow-soft sm:p-6" style={{ maxHeight: "min(85vh, calc(100dvh - 2rem))" }}>
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-xl font-bold">{guide.title}</h2>
              <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-blush/10" aria-label="Fechar guia de instalação" onClick={close}><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Dispositivo para instalação">
              {[{ value: "ios", label: "iPhone / iPad" }, { value: "android", label: "Android" }, { value: "desktop", label: "Computador" }].map((option) => <button key={option.value} type="button" aria-pressed={guidePlatform === option.value} onClick={() => setGuidePlatform(option.value)} className={`min-h-11 rounded-xl px-3 py-2 text-xs font-bold ${guidePlatform === option.value ? "bg-blush text-white" : "bg-blush/10 text-blush"}`}>{option.label}</button>)}
            </div>
            {guidePlatform === "ios" && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-blush"><Share className="h-5 w-5 shrink-0" aria-hidden="true" />A instalação é confirmada pelo menu do Safari.</p>}
            <ol className="mt-5 space-y-4">
              {guide.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-relaxed"><span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blush/10 text-xs font-bold text-blush">{index + 1}</span><span>{step}</span></li>)}
            </ol>
            <p className="mt-5 rounded-2xl bg-blush/10 p-3 text-xs leading-relaxed text-ink">{guide.help}</p>
            <p className="mt-4 text-xs leading-relaxed text-muted">{guide.note}</p>
            <Button type="button" className="mt-5 w-full" onClick={close}>Entendi</Button>
          </section>
        </div>, document.body,
      )}
    </>
  );
}

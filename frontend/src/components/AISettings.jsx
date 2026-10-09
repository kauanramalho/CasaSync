import { useEffect, useRef, useState } from "react";
import Button from "./Button";
import Card from "./Card";
import useAIQuickReview from "../hooks/useAIQuickReview";
import { useToast } from "../hooks/useToast";
import { imageAnalysisApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";

export default function AISettings({ userId }) {
  const { enabled, update } = useAIQuickReview(userId);
  const { showToast } = useToast();
  const [instructions, setInstructions] = useState("");
  const [limit, setLimit] = useState(1500);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoaded(false);
    setError("");
    imageAnalysisApi.getPreferences().then((result) => {
      if (!alive) return;
      setInstructions(result.customInstructions || "");
      setLimit(result.maxLength || 1500);
      setLoaded(true);
    }).catch((err) => { if (alive) setError(normalizeApiError(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]);
  async function save(event) {
    event.preventDefault();
    if (busyRef.current || loading || !loaded) return;
    busyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await imageAnalysisApi.savePreferences({ customInstructions: instructions });
      setInstructions(result.customInstructions || "");
      showToast({ type: "success", message: "Instruções da IA salvas na sua conta." });
    } catch (err) { setError(normalizeApiError(err)); }
    finally { busyRef.current = false; setSaving(false); }
  }
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <Card>
        <h2 className="section-title">Criação com IA</h2>
        <label className="mt-4 flex min-h-11 items-start gap-3 text-sm font-bold text-ink">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-blue-600" checked={enabled}
            onChange={(event) => {
              if (!update(event.target.checked)) showToast({ type: "error", message: "Não foi possível salvar a preferência neste aparelho." });
            }} />
          Priorizar sugestões de alta confiança
        </label>
        <p className="mt-2 text-sm text-muted">Após analisar, você revisa e confirma a criação. Itens incertos continuam para revisão, nunca são salvos sem confirmação.</p>
        <p className="mt-2 text-xs text-muted">Preferência desta conta neste aparelho. Nenhuma tarefa é criada ao ativar esta opção.</p>
      </Card>
      <Card>
        <h2 className="section-title">Instruções da IA</h2>
        <p className="mt-2 text-sm text-muted">Preferências de categorias, responsáveis e lembretes. Salvas na sua conta para todos os aparelhos.</p>
        <form onSubmit={save} className="mt-4 space-y-3">
          <label htmlFor="ai-custom-instructions" className="block text-sm font-semibold text-ink">Instruções opcionais</label>
          <textarea id="ai-custom-instructions" className="soft-input min-h-32 resize-y" value={instructions} maxLength={limit}
            onChange={(event) => setInstructions(event.target.value)} disabled={loading || saving || !loaded}
            placeholder="Ex.: sugerir lembrete de 1 hora antes." />
          <p className="text-xs text-muted">{instructions.length}/{limit}</p>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
          {!loading && !loaded && <p className="text-sm text-muted">Reabra esta aba para tentar carregar suas instruções novamente. Nada foi alterado.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setInstructions("")} disabled={loading || saving || !loaded}>Limpar texto</Button>
            <Button type="submit" disabled={loading || saving || !loaded}>{loading ? "Carregando..." : saving ? "Salvando..." : "Salvar instruções"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Button from "../components/Button";
import PasswordInput from "../components/PasswordInput";
import AuthLayout from "../layouts/AuthLayout";
import { authApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";

export default function ForgotPassword() {
  const { state } = useLocation();
  const [email, setEmail] = useState(state?.email || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const inFlight = useRef(false);

  async function run(action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try { await action(); }
    catch (err) { setError(normalizeApiError(err)); }
    finally { inFlight.current = false; setLoading(false); }
  }

  async function sendCode() {
    await run(async () => {
      if (Date.now() < resendAt) {
        setError("Aguarde um minuto antes de solicitar outro código.");
        return;
      }
      await authApi.forgotPassword({ email: email.trim().toLowerCase() });
      setMessage("Se houver uma conta ativa com esse e-mail, você receberá um código. Confira também a pasta de spam.");
      setResendAt(Date.now() + 60000);
      setCode("");
      setStep("reset");
    });
  }

  function submit(event) {
    event.preventDefault();
    if (step === "email") { void sendCode(); return; }
    if (password !== confirmation) { setError("As senhas não conferem."); return; }
    void run(async () => {
      await authApi.resetPassword({ email: email.trim().toLowerCase(), code, new_password: password });
      setPassword(""); setConfirmation(""); setCode("");
      setMessage("Senha alterada. Entre com seu e-mail e a nova senha.");
      setStep("done");
    });
  }

  return (
    <AuthLayout title={step === "done" ? "Senha alterada" : "Recupere sua senha"} subtitle="Recupere o acesso à sua conta pelo e-mail, mantendo suas famílias e tarefas.">
      {message && <p role="status" className="mb-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink">{message}</p>}
      {step !== "done" && <form onSubmit={submit} className="space-y-4">
        <input className="soft-input" type="email" aria-label="E-mail da conta" placeholder="E-mail da conta" autoComplete="email" maxLength={255} required value={email} disabled={loading || step === "reset"} onChange={(event) => setEmail(event.target.value)} />
        {step === "reset" && <>
          <input className="soft-input" aria-label="Código recebido por e-mail" placeholder="Código recebido por e-mail" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,10}" maxLength={10} required value={code} disabled={loading} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          <p className="text-sm text-muted">O código expira em poucos minutos. Use uma senha com pelo menos 8 caracteres, incluindo letra e número.</p>
          <PasswordInput aria-label="Nova senha" placeholder="Nova senha" autoComplete="new-password" minLength={8} maxLength={128} required value={password} disabled={loading} onChange={(event) => setPassword(event.target.value)} />
          <PasswordInput aria-label="Confirmar nova senha" placeholder="Confirmar nova senha" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} disabled={loading} onChange={(event) => setConfirmation(event.target.value)} />
        </>}
        {error && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Aguarde..." : step === "email" ? "Enviar código" : "Salvar nova senha"}</Button>
        {step === "reset" && <div className="flex flex-wrap justify-between gap-3 text-sm font-bold text-blush">
          <button type="button" disabled={loading} onClick={() => void sendCode()}>Reenviar código</button>
          <button type="button" disabled={loading} onClick={() => { setStep("email"); setMessage(""); setError(""); setCode(""); setPassword(""); setConfirmation(""); }}>Alterar e-mail</button>
        </div>}
      </form>}
      <p className="mt-6 text-center text-sm"><Link className="font-bold text-blush" to="/login">Voltar para o login</Link></p>
    </AuthLayout>
  );
}

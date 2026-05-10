import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, RefreshCw, ShieldCheck } from "lucide-react";

import Button from "../components/Button";
import AuthLayout from "../layouts/AuthLayout";
import { useAuth } from "../hooks/useAuth";
import { normalizeApiError } from "../utils/formatters";

function secondsUntil(value) {
  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

function formatRemaining(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function VerifyCode() {
  const navigate = useNavigate();
  const { user, twoFactor, verifyTwoFactor, resendTwoFactor, clearPendingChallenge } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [remaining, setRemaining] = useState(() => (twoFactor?.expires_at ? secondsUntil(twoFactor.expires_at) : 0));

  const destination = twoFactor?.purpose === "signup" ? "/familia" : "/";
  const subtitle = useMemo(() => {
    if (!twoFactor) return "";
    return twoFactor.purpose === "signup"
      ? "Confirme o codigo enviado para ativar sua conta."
      : "Confirme o codigo enviado para concluir o login.";
  }, [twoFactor]);

  useEffect(() => {
    if (!twoFactor?.expires_at) return undefined;
    setRemaining(secondsUntil(twoFactor.expires_at));
    const id = window.setInterval(() => {
      setRemaining(secondsUntil(twoFactor.expires_at));
    }, 1000);
    return () => window.clearInterval(id);
  }, [twoFactor?.expires_at]);

  if (user) return <Navigate to="/" replace />;
  if (!twoFactor) return <Navigate to="/login" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await verifyTwoFactor(code);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError("");
    setMessage("");
    try {
      await resendTwoFactor();
      setCode("");
      setMessage("Enviamos um novo codigo para seu e-mail.");
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setResending(false);
    }
  }

  function handleBack() {
    clearPendingChallenge();
    navigate(twoFactor.purpose === "signup" ? "/cadastro" : "/login", { replace: true });
  }

  return (
    <AuthLayout title="Verifique seu e-mail" subtitle={subtitle}>
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-100 bg-white/80 px-4 py-3 text-sm text-muted">
        <Mail className="h-5 w-5 shrink-0 text-blush" />
        <span>Codigo enviado para {twoFactor.masked_email}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="soft-input text-center text-2xl font-bold tracking-[0.35em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          minLength={6}
          maxLength={6}
          required
        />

        <div className="flex items-center justify-between gap-3 text-sm text-muted">
          <span>{remaining > 0 ? `Expira em ${formatRemaining(remaining)}` : "Codigo expirado"}</span>
          <button
            className="inline-flex items-center gap-2 font-bold text-blush disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={handleResend}
            disabled={resending}
          >
            <RefreshCw className="h-4 w-4" />
            {resending ? "Enviando..." : "Reenviar"}
          </button>
        </div>

        {message && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}
        {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
          <ShieldCheck className="h-5 w-5" />
          {loading ? "Verificando..." : "Confirmar codigo"}
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between gap-3 text-sm">
        <button className="inline-flex items-center gap-2 font-bold text-muted hover:text-ink" type="button" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <Link className="font-bold text-blush" to="/login" onClick={clearPendingChallenge}>
          Ir para login
        </Link>
      </div>
    </AuthLayout>
  );
}

import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";

import Button from "../components/Button";
import PasswordInput from "../components/PasswordInput";
import AuthLayout from "../layouts/AuthLayout";
import { useAuth } from "../hooks/useAuth";
import { normalizeApiError } from "../utils/formatters";
import { isTwoFactorRequiredResponse } from "../utils/auth";

export default function Login() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [rememberSession, setRememberSession] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await login(form, { rememberSession });
      if (isTwoFactorRequiredResponse(response)) {
        navigate("/verificacao", { replace: true });
        return;
      }
      navigate("/");
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre para organizar tarefas, compromissos e planos da família.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="soft-input"
          type="text"
          placeholder="Digite seu email ou username"
          aria-label="Email ou username"
          value={form.identifier}
          onChange={(event) => setForm((current) => ({ ...current, identifier: event.target.value }))}
          autoComplete="username"
          required
        />
        <PasswordInput
          placeholder="Senha"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          autoComplete="current-password"
          minLength={8}
          required
        />
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm font-semibold text-muted transition hover:bg-white">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-blush"
            checked={rememberSession}
            onChange={(event) => setRememberSession(event.target.checked)}
          />
          Manter conta aberta
        </label>
        {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          <LogIn className="h-5 w-5" />
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link className="font-bold text-blush" to="/cadastro">
          Criar cadastro
        </Link>
      </p>
    </AuthLayout>
  );
}

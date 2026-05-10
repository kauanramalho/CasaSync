import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";

import Button from "../components/Button";
import AuthLayout from "../layouts/AuthLayout";
import { useAuth } from "../hooks/useAuth";
import { normalizeApiError } from "../utils/formatters";

export default function Login() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await login(form);
      if (response?.requires_two_factor) {
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
          type="email"
          placeholder="E-mail"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          required
        />
        <input
          className="soft-input"
          type="password"
          placeholder="Senha"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          minLength={8}
          required
        />
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

import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

import Button from "../components/Button";
import PasswordInput from "../components/PasswordInput";
import AuthLayout from "../layouts/AuthLayout";
import { useAuth } from "../hooks/useAuth";
import { normalizeApiError } from "../utils/formatters";

export default function Register() {
  const navigate = useNavigate();
  const { register, user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("As senhas nao conferem. Confira os dois campos antes de criar a conta.");
      return;
    }

    setLoading(true);
    try {
      const { confirmPassword: _confirmPassword, ...registerPayload } = form;
      const response = await register(registerPayload);
      if (response?.requires_two_factor) {
        navigate("/verificacao", { replace: true });
        return;
      }
      navigate("/familia");
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Crie sua conta" subtitle="Comece uma família, convide alguém e transforme combinados em tarefas claras.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="soft-input"
          placeholder="Nome"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          minLength={2}
          required
        />
        <input
          className="soft-input"
          type="email"
          placeholder="E-mail"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          required
        />
        <PasswordInput
          placeholder="Senha"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <PasswordInput
          placeholder="Confirmar senha"
          value={form.confirmPassword}
          onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          autoComplete="new-password"
          minLength={8}
          required
        />
        {error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          <Sparkles className="h-5 w-5" />
          {loading ? "Criando..." : "Criar conta"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Já tem conta?{" "}
        <Link className="font-bold text-blush" to="/login">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}

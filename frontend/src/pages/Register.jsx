import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";

import Button from "../components/Button";
import AuthLayout from "../layouts/AuthLayout";
import { useAuth } from "../hooks/useAuth";
import { normalizeApiError } from "../utils/formatters";

export default function Register() {
  const navigate = useNavigate();
  const { register, user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register(form);
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
        />
        <input
          className="soft-input"
          type="email"
          placeholder="E-mail"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />
        <input
          className="soft-input"
          type="password"
          placeholder="Senha"
          value={form.password}
          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
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


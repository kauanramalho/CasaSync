import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AtSign, Camera, LockKeyhole, Mail, Save, UserRound, X } from "lucide-react";

import Button from "./Button";
import ImageAdjustField from "./ImageAdjustField";
import PasswordInput from "./PasswordInput";
import { useAuth } from "../hooks/useAuth";
import { authApi, clearToken } from "../services/api";
import { emitAuthSessionChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";

const usernamePattern = /^(?=.*[a-z0-9])[a-z0-9._-]{3,30}$/;

export default function ProfileModal({ user, onClose, onSaved }) {
  const navigate = useNavigate();
  const { beginTwoFactor } = useAuth();
  const avatarFieldRef = useRef(null);
  const [form, setForm] = useState({ name: "", email: "", username: "" });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      name: user?.name || "",
      email: user?.email || "",
      username: user?.username || ""
    });
    setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    avatarFieldRef.current?.resetDraft();
  }, [user]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextUsername = form.username.trim().toLowerCase();
      if (nextUsername && !usernamePattern.test(nextUsername)) {
        throw new Error("Username deve ter 3 a 30 caracteres e usar apenas letras, numeros, ponto, underline ou hifen.");
      }
      const avatarUrl = await avatarFieldRef.current?.getValue();

      const updated = await authApi.updateMe({
        name: form.name,
        email: form.email,
        username: nextUsername || null,
        avatar_url: avatarUrl
      });

      if (updated.requires_two_factor) {
        beginTwoFactor(updated);
        navigate("/verificacao", { replace: true });
        return;
      }

      if (passwordForm.new_password || passwordForm.current_password || passwordForm.confirm_password) {
        if (passwordForm.new_password !== passwordForm.confirm_password) {
          throw new Error("A confirmacao da nova senha nao confere.");
        }
        await authApi.changePassword({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password
        });
        clearToken();
        emitAuthSessionChanged();
        return;
      }

      onSaved?.(updated);
      setMessage("Perfil atualizado com sucesso.");
      avatarFieldRef.current?.resetDraft();
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/30 px-3 py-4 backdrop-blur-md sm:px-4 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-soft animate-in sm:rounded-[30px]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="section-title">Meu perfil</p>
            <p className="mt-1 text-sm text-muted">Dados da conta, foto e seguranca em um so lugar.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted transition hover:bg-rose-50 hover:text-blush">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(92vh-82px)] overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <div className="rounded-[26px] bg-gradient-to-br from-rose-50 via-white to-violet-50 p-5 shadow-card">
              <ImageAdjustField
                ref={avatarFieldRef}
                value={user?.avatar_url || ""}
                chooseLabel="Trocar foto"
                removeLabel="Remover foto"
                previewClassName="mx-auto h-40 w-40 rounded-full ring-8 ring-white"
                emptyLabel={form.name?.[0]?.toUpperCase() || "C"}
                uploadScope="avatar"
                onError={setError}
              />
            </div>

            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                    <UserRound className="h-4 w-4 text-blush" />
                    Nome
                  </span>
                  <input className="soft-input" value={form.name} onChange={(event) => updateField("name", event.target.value)} required />
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                    <AtSign className="h-4 w-4 text-violet-500" />
                    Username
                  </span>
                  <input
                    className="soft-input"
                    value={form.username}
                    onChange={(event) => updateField("username", event.target.value.trim().toLowerCase())}
                    placeholder="seu_usuario"
                    autoComplete="username"
                    minLength={3}
                    maxLength={30}
                    pattern="(?=.*[a-z0-9])[a-z0-9._-]{3,30}"
                  />
                </label>

                <label className="block md:col-span-2">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                    <Mail className="h-4 w-4 text-blue-500" />
                    E-mail
                  </span>
                  <input className="soft-input" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
                </label>
              </div>

              <div className="rounded-[26px] border border-rose-100 bg-rose-50/50 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <LockKeyhole className="h-5 w-5 text-blush" />
                  <p className="font-bold text-ink">Alterar senha</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <PasswordInput placeholder="Senha atual" value={passwordForm.current_password} onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))} autoComplete="current-password" />
                  <PasswordInput placeholder="Nova senha" value={passwordForm.new_password} onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))} autoComplete="new-password" />
                  <PasswordInput placeholder="Confirmar nova senha" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))} autoComplete="new-password" />
                </div>
              </div>

              {(message || error) && (
                <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${error ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
                  {error || message}
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Camera className="h-5 w-5 animate-pulse" /> : <Save className="h-5 w-5" />}
                  Salvar perfil
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

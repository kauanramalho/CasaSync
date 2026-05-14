import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AtSign, Camera, ImagePlus, LockKeyhole, Mail, Save, Trash2, UserRound, X } from "lucide-react";

import Button from "./Button";
import PasswordInput from "./PasswordInput";
import { useAuth } from "../hooks/useAuth";
import { authApi, clearToken } from "../services/api";
import { emitAuthSessionChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cropAvatar(dataUrl, crop) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(size / image.width, size / image.height) * crop.zoom;
      const width = image.width * scale;
      const height = image.height * scale;
      const dx = (size - width) / 2 + crop.x * 2.2;
      const dy = (size - height) / 2 + crop.y * 2.2;
      ctx.drawImage(image, dx, dy, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

export default function ProfileModal({ user, onClose, onSaved }) {
  const navigate = useNavigate();
  const { beginTwoFactor } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", username: "" });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [avatarDraft, setAvatarDraft] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [crop, setCrop] = useState({ zoom: 1, x: 0, y: 0 });
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
    setAvatarDraft("");
    setRemoveAvatar(false);
    setCrop({ zoom: 1, x: 0, y: 0 });
  }, [user]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const previewUrl = useMemo(() => {
    if (removeAvatar) return "";
    return avatarDraft || user?.avatar_url || "";
  }, [avatarDraft, removeAvatar, user?.avatar_url]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    const dataUrl = await readFileAsDataUrl(file);
    setAvatarDraft(dataUrl);
    setRemoveAvatar(false);
    setCrop({ zoom: 1, x: 0, y: 0 });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      let avatarUrl = user?.avatar_url || null;
      if (removeAvatar) avatarUrl = null;
      if (avatarDraft) avatarUrl = await cropAvatar(avatarDraft, crop);

      const updated = await authApi.updateMe({
        name: form.name,
        email: form.email,
        username: form.username || null,
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
      setAvatarDraft("");
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/30 px-4 py-8 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-soft animate-in" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="section-title">Meu perfil</p>
            <p className="mt-1 text-sm text-muted">Dados da conta, foto e seguranca em um so lugar.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-50 text-muted transition hover:bg-rose-50 hover:text-blush">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(92vh-82px)] overflow-y-auto p-6">
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <div className="rounded-[26px] bg-gradient-to-br from-rose-50 via-white to-violet-50 p-5 shadow-card">
              <div className="mx-auto h-40 w-40 overflow-hidden rounded-full bg-gradient-to-br from-rose-200 to-violet-200 ring-8 ring-white">
                {previewUrl ? (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${previewUrl})`,
                      backgroundSize: `${Math.max(100, crop.zoom * 100)}%`,
                      backgroundPosition: `${50 + crop.x / 4}% ${50 + crop.y / 4}%`
                    }}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-5xl font-bold text-ink">{form.name?.[0]?.toUpperCase() || "C"}</div>
                )}
              </div>

              <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-blush shadow-card transition hover:-translate-y-0.5 hover:bg-rose-50">
                <ImagePlus className="h-4 w-4" />
                Trocar foto
                <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </label>

              {(avatarDraft || user?.avatar_url) && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarDraft("");
                    setRemoveAvatar(true);
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover foto
                </button>
              )}

              {avatarDraft && (
                <div className="mt-5 space-y-3 rounded-2xl bg-white/80 p-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-bold text-muted">
                      <span>Zoom</span>
                      <span>{crop.zoom.toFixed(1)}x</span>
                    </div>
                    <input className="w-full accent-rose-400" type="range" min="1" max="2.4" step="0.1" value={crop.zoom} onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold text-muted">Posicao</p>
                    <input className="w-full accent-rose-400" type="range" min="-40" max="40" value={crop.x} onChange={(event) => setCrop((current) => ({ ...current, x: Number(event.target.value) }))} />
                    <input className="mt-2 w-full accent-rose-400" type="range" min="-40" max="40" value={crop.y} onChange={(event) => setCrop((current) => ({ ...current, y: Number(event.target.value) }))} />
                  </div>
                </div>
              )}
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
                  <input className="soft-input" value={form.username} onChange={(event) => updateField("username", event.target.value)} placeholder="seu_usuario" />
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

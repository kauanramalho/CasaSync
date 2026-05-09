import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Database,
  LockKeyhole,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldAlert,
  User
} from "lucide-react";

import Avatar from "../components/Avatar";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import ProfileModal from "../components/ProfileModal";
import SelectMenu from "../components/SelectMenu";
import { useAppPreferences } from "../hooks/useAppPreferences";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { familiesApi, integrationsApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";
import { timezoneOptions, weekStartOptions } from "../utils/preferences";

const tabs = [
  { key: "general", label: "Gerais", icon: SettingsIcon },
  { key: "appearance", label: "Aparencia", icon: Palette },
  { key: "account", label: "Conta", icon: User },
  { key: "security", label: "Seguranca", icon: LockKeyhole }
];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { preferences, updatePreference, updatePreferences } = useAppPreferences();
  const { paletteId, palettes, selectPalette } = useTheme();
  const [activeTab, setActiveTab] = useState("general");
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [family, setFamily] = useState(null);
  const [familyForm, setFamilyForm] = useState({ name: "" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingFamily, setSavingFamily] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadSettings() {
      const [calendarResult, familyResult] = await Promise.allSettled([integrationsApi.googleCalendarStatus(), familiesApi.current()]);
      if (!alive) return;

      if (calendarResult.status === "fulfilled") setCalendarStatus(calendarResult.value);
      if (familyResult.status === "fulfilled") {
        setFamily(familyResult.value);
        setFamilyForm({ name: familyResult.value?.name || "" });
      }
      if (calendarResult.status === "rejected") setError(normalizeApiError(calendarResult.reason));
    }

    loadSettings();
    return () => {
      alive = false;
    };
  }, []);

  async function connectCalendar() {
    try {
      const response = await integrationsApi.googleCalendarConnectUrl();
      setCalendarMessage(response.message);
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function saveFamilySettings() {
    setError("");
    setMessage("");
    setSavingFamily(true);
    try {
      const nextName = familyForm.name.trim();
      if (!family) {
        throw new Error("Crie ou entre em uma familia antes de salvar as configuracoes.");
      }
      if (nextName.length < 2) {
        throw new Error("Informe um nome de familia com pelo menos 2 caracteres.");
      }

      updatePreferences({ timezone: preferences.timezone });
      const updated = await familiesApi.updateCurrent({ name: nextName });
      if (!updated?.id || updated.name?.trim() !== nextName) {
        throw new Error("Nao foi possivel confirmar o novo nome da familia.");
      }
      setFamily(updated);
      setFamilyForm({ name: updated.name || "" });
      emitAppDataChanged();
      setMessage("Alteracoes salvas com sucesso.");
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setSavingFamily(false);
    }
  }

  return (
    <>
      <PageHeader title="Configuracoes" user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}
      {message && <p className="mb-5 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-600">{message}</p>}

      <div className="mb-8 flex gap-3 overflow-x-auto border-b border-slate-200 pb-1">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-2 rounded-t-2xl px-5 py-4 text-sm font-semibold transition ${
                active ? "border-b-2 border-blush bg-white text-blush shadow-card" : "text-muted hover:bg-white/70 hover:text-ink"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "general" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h2 className="section-title">Configuracoes gerais</h2>
            <div className="mt-6 space-y-5">
              <div className="grid gap-3 md:grid-cols-[1fr_220px] md:items-center">
                <p className="font-semibold text-muted">Idioma</p>
                <SelectMenu value={preferences.language} onChange={(value) => updatePreference("language", value)} options={[{ value: "pt-BR", label: "Portugues" }]} />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_220px] md:items-center">
                <p className="font-semibold text-muted">Moeda</p>
                <SelectMenu value={preferences.currency} onChange={(value) => updatePreference("currency", value)} options={[{ value: "BRL", label: "BRL (R$)" }]} />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_220px] md:items-center">
                <p className="font-semibold text-muted">Inicio da semana</p>
                <SelectMenu value={preferences.weekStart} onChange={(value) => updatePreference("weekStart", value)} options={weekStartOptions} />
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">Modo casal</p>
                  <p className="text-sm text-muted">Espaco seguro apenas para o casal</p>
                </div>
                <span className="h-7 w-12 rounded-full bg-emerald-400 p-1">
                  <span className="block h-5 w-5 translate-x-5 rounded-full bg-white" />
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="section-title">Sobre a familia</h2>
            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-muted">Nome da familia</span>
                <input className="soft-input" value={familyForm.name} onChange={(event) => setFamilyForm({ name: event.target.value })} placeholder="Nome da familia" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-muted">Codigo de convite</span>
                <input className="soft-input" value={family?.invite_code || "Carregando..."} readOnly />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-muted">Fuso horario</span>
                <SelectMenu value={preferences.timezone} onChange={(value) => updatePreference("timezone", value)} options={timezoneOptions} />
              </label>
              <Button className="mx-auto flex w-full md:w-64" onClick={saveFamilySettings} disabled={savingFamily || !family || familyForm.name.trim().length < 2}>
                {savingFamily ? "Salvando..." : "Salvar alteracoes"}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-muted" />
              <h2 className="section-title">Armazenamento e dados</h2>
            </div>
            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">Backup automatico</p>
                  <p className="text-sm text-muted">Dados salvos diariamente</p>
                </div>
                <RefreshCw className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm text-muted">
                  <span>1.2 GB de 10 GB utilizados</span>
                  <span>12%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 w-[12%] rounded-full bg-blush" />
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <CalendarDays className="h-6 w-6 text-blush" />
              <h2 className="section-title">Google Agenda</h2>
            </div>
            <p className="mt-4 text-sm text-muted">{calendarStatus?.message || "Verificando conexao..."}</p>
            {calendarMessage && <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600">{calendarMessage}</p>}
            <Button onClick={connectCalendar} className="mt-6">
              Conectar Google Agenda
            </Button>
          </Card>
        </div>
      )}

      {activeTab === "appearance" && (
        <Card>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="section-title">Escolha a paleta do CasaSync</h2>
              <p className="mt-2 text-sm text-muted">A paleta selecionada ajusta fundos, cards, botoes, foco, graficos e destaques da interface.</p>
            </div>
            <span className="rounded-full bg-blush/10 px-3 py-1 text-xs font-bold text-blush">Persistencia automatica</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {palettes.map((palette) => {
              const active = palette.id === paletteId;
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => selectPalette(palette.id)}
                  className={`group flex min-h-[220px] flex-col rounded-[24px] border p-4 text-left shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-soft ${
                    active ? "border-blush bg-blush/10 ring-4 ring-blush/10" : "border-white/80 bg-white/80 hover:border-blush/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink">{palette.name}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{palette.description}</p>
                    </div>
                    {active && (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-blush text-white shadow-card">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-5">
                    <div className="grid grid-cols-4 gap-2">
                      {palette.swatches.map((swatch) => (
                        <span key={swatch} className="h-10 rounded-2xl border border-white/70 shadow-sm" style={{ backgroundColor: swatch }} />
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-blush text-white" : "bg-white text-muted"}`}>
                        {active ? "Atual" : "Selecionar"}
                      </span>
                      <span className="h-2 w-16 rounded-full bg-gradient-to-r from-peach to-blush opacity-80 transition group-hover:w-20" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {activeTab === "account" && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <div className="flex flex-col items-center text-center">
              <Avatar user={user} size="lg" />
              <h2 className="mt-4 text-xl font-bold text-ink">{user?.name || "Usuario CasaSync"}</h2>
              <p className="mt-1 text-sm font-semibold text-muted">{user?.email || "email nao informado"}</p>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <BadgeCheck className="h-4 w-4" />
                Conta ativa
              </span>
            </div>

            <div className="mt-6 grid gap-3">
              <Button onClick={() => setProfileOpen(true)}>Editar perfil</Button>
              <Button variant="secondary" onClick={() => setActiveTab("security")}>
                Alterar senha
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="section-title">Dados da conta</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white/75 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Nome</p>
                <p className="mt-2 font-semibold text-ink">{user?.name || "Nao informado"}</p>
              </div>
              <div className="rounded-2xl bg-white/75 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">E-mail</p>
                <p className="mt-2 font-semibold text-ink">{user?.email || "Nao informado"}</p>
              </div>
              <div className="rounded-2xl bg-white/75 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Usuario</p>
                <p className="mt-2 font-semibold text-ink">{user?.username ? `@${user.username}` : "Nao informado"}</p>
              </div>
              <div className="rounded-2xl bg-white/75 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Familia</p>
                <p className="mt-2 font-semibold text-ink">{family?.name || "Kauan & Bia"}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "security" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-6 w-6 text-blush" />
              <h2 className="section-title">Seguranca da conta</h2>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-white/75 p-4">
                <p className="font-semibold text-ink">Senha</p>
                <p className="mt-1 text-sm text-muted">Mantenha uma senha forte para proteger as tarefas e dados da familia.</p>
                <Button variant="secondary" className="mt-4" onClick={() => setProfileOpen(true)}>
                  Alterar senha
                </Button>
              </div>
              <div className="rounded-2xl bg-white/75 p-4">
                <p className="font-semibold text-ink">Sessao atual</p>
                <p className="mt-1 text-sm text-muted">Acesso autenticado neste navegador.</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="h-6 w-6" />
              <h2 className="section-title text-rose-700">Zona de perigo</h2>
            </div>
            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl bg-rose-50 px-4 py-4">
                <p className="font-semibold text-rose-600">Redefinir dados</p>
                <p className="mt-1 text-sm text-muted">Esta acao apagara tarefas e categorias da familia.</p>
              </div>
              <div className="rounded-2xl bg-rose-50 px-4 py-4">
                <p className="font-semibold text-rose-600">Excluir conta</p>
                <p className="mt-1 text-sm text-muted">Acao permanente e irreversivel.</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {profileOpen && <ProfileModal user={user} onClose={() => setProfileOpen(false)} onSaved={updateUser} />}
    </>
  );
}

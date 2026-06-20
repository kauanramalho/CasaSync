import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  BellRing,
  CalendarDays,
  Check,
  Database,
  LockKeyhole,
  Mail,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldAlert,
  Smartphone,
  Unplug,
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
import { useToast } from "../hooks/useToast";
import { familiesApi, integrationsApi, notificationsApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";
import { timezoneOptions, weekStartOptions } from "../utils/preferences";
import {
  getBrowserPushSupport,
  getBrowserPushSubscription,
  getNotificationPermission,
  getNotificationPermissionLabel,
  subscribeToBrowserPush,
  unsubscribeFromBrowserPush
} from "../utils/pushNotifications";

const tabs = [
  { key: "general", label: "Gerais", icon: SettingsIcon },
  { key: "notifications", label: "Notificacoes", icon: BellRing },
  { key: "appearance", label: "Aparencia", icon: Palette },
  { key: "account", label: "Conta", icon: User },
  { key: "security", label: "Seguranca", icon: LockKeyhole }
];

const calendarModeOptions = [
  { value: "primary", label: "Usar minha agenda principal" },
  { value: "family_calendar", label: "Usar agenda separada desta familia" },
  { value: "disabled", label: "Desativar nesta familia" }
];

function isAdminRole(role) {
  return role === "owner" || role === "admin";
}

export default function Settings() {
  const { user, updateUser, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { preferences, updatePreference, updatePreferences } = useAppPreferences();
  const { paletteId, palettes, selectPalette } = useTheme();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState("general");
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarStatusLoading, setCalendarStatusLoading] = useState(true);
  const [calendarMode, setCalendarMode] = useState("primary");
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [notificationBusy, setNotificationBusy] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [devicePushEnabled, setDevicePushEnabled] = useState(false);
  const [family, setFamily] = useState(null);
  const [currentMember, setCurrentMember] = useState(null);
  const [familyForm, setFamilyForm] = useState({ name: "" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [error, setError] = useState("");
  const [savingFamily, setSavingFamily] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadSettings() {
      const [calendarResult, notificationResult, familyResult, membersResult, pushSubscriptionResult] = await Promise.allSettled([
        integrationsApi.googleCalendarStatus(),
        notificationsApi.settings(),
        familiesApi.current(),
        familiesApi.members(),
        getBrowserPushSubscription()
      ]);
      if (!alive) return;

      if (calendarResult.status === "fulfilled") {
        setCalendarStatus(calendarResult.value);
        setCalendarMode(calendarResult.value?.mode || "primary");
      }
      if (notificationResult.status === "fulfilled") setNotificationSettings(notificationResult.value);
      if (familyResult.status === "fulfilled") {
        setFamily(familyResult.value);
        setFamilyForm({ name: familyResult.value?.name || "" });
      }
      if (membersResult.status === "fulfilled") {
        setCurrentMember(membersResult.value.find((member) => member.user_id === user?.id) || null);
      }
      if (pushSubscriptionResult.status === "fulfilled") {
        setDevicePushEnabled(Boolean(pushSubscriptionResult.value));
      }
      if (calendarResult.status === "rejected") {
        const message = normalizeApiError(calendarResult.reason);
        setError(message);
        showToast({ type: "error", message });
      }
      setCalendarStatusLoading(false);
    }

    loadSettings();
    return () => {
      alive = false;
    };
  }, [showToast, user?.id]);

  useEffect(() => {
    const googleCalendarStatus = searchParams.get("googleCalendar");
    const message = searchParams.get("message");
    if (!googleCalendarStatus) return;

    setActiveTab("general");
    if (message) {
      setCalendarMessage(message);
      showToast({ type: googleCalendarStatus === "connected" ? "success" : "info", message });
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("googleCalendar");
    nextParams.delete("message");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, showToast]);

  const canAdminFamily = isAdminRole(currentMember?.role);

  async function refreshCalendarStatus() {
    setCalendarStatusLoading(true);
    try {
      const nextStatus = await integrationsApi.googleCalendarStatus();
      setCalendarStatus(nextStatus);
      setCalendarMode(nextStatus?.mode || "primary");
      return nextStatus;
    } finally {
      setCalendarStatusLoading(false);
    }
  }

  async function refreshNotificationSettings() {
    const nextSettings = await notificationsApi.settings();
    setNotificationSettings(nextSettings);
    return nextSettings;
  }

  async function updateNotificationPreferences(payload) {
    setNotificationBusy("preferences");
    setNotificationMessage("");
    try {
      const nextSettings = await notificationsApi.updatePreferences(payload);
      setNotificationSettings(nextSettings);
      updateUser({
        ...user,
        email_task_reminders_enabled: nextSettings.email_task_reminders_enabled,
        push_task_reminders_enabled: nextSettings.push_task_reminders_enabled
      });
      showToast({ type: "success", message: "Preferencias de notificacao salvas." });
    } catch (err) {
      const message = normalizeApiError(err);
      setNotificationMessage(message);
      showToast({ type: "error", message });
    } finally {
      setNotificationBusy("");
    }
  }

  async function enableBrowserPush() {
    setNotificationBusy("push");
    setNotificationMessage("");
    try {
      const settings = notificationSettings || (await refreshNotificationSettings());
      if (!settings.push_feature_enabled || !settings.push_configured) {
        throw new Error("Notificacoes do navegador estao desativadas no servidor.");
      }
      const subscription = await subscribeToBrowserPush(settings.vapid_public_key);
      const response = await notificationsApi.savePushSubscription(subscription);
      setDevicePushEnabled(true);
      const nextSettings = await refreshNotificationSettings();
      updateUser({ ...user, push_task_reminders_enabled: nextSettings.push_task_reminders_enabled });
      setNotificationMessage(response.message);
      showToast({ type: "success", message: response.message });
    } catch (err) {
      const message = normalizeApiError(err);
      setNotificationMessage(message);
      showToast({ type: "error", message });
    } finally {
      setNotificationBusy("");
    }
  }

  async function disableBrowserPush() {
    setNotificationBusy("push");
    setNotificationMessage("");
    try {
      const subscription = await unsubscribeFromBrowserPush();
      const response = await notificationsApi.deletePushSubscription(subscription);
      setDevicePushEnabled(false);
      const nextSettings = await refreshNotificationSettings();
      updateUser({ ...user, push_task_reminders_enabled: nextSettings.push_task_reminders_enabled });
      setNotificationMessage(response.message);
      showToast({ type: "success", message: response.message });
    } catch (err) {
      const message = normalizeApiError(err);
      setNotificationMessage(message);
      showToast({ type: "error", message });
    } finally {
      setNotificationBusy("");
    }
  }

  async function runReminderCheck() {
    setNotificationBusy("reminders");
    setNotificationMessage("");
    try {
      await notificationsApi.processReminders();
      emitAppDataChanged();
      showToast({ type: "success", message: "Verificacao de lembretes executada." });
    } catch (err) {
      const message = normalizeApiError(err);
      setNotificationMessage(message);
      showToast({ type: "error", message });
    } finally {
      setNotificationBusy("");
    }
  }

  async function connectCalendar() {
    setCalendarBusy(true);
    try {
      const response = await integrationsApi.googleCalendarConnectUrl();
      if (response.url) {
        window.location.assign(response.url);
        return;
      }
      setCalendarMessage(response.message);
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setCalendarBusy(false);
    }
  }

  async function disconnectCalendar() {
    if (!window.confirm("Desconectar sua conta Google do CasaSync? As configuracoes de cada familia serao preservadas.")) return;
    setCalendarBusy(true);
    setError("");
    try {
      const response = await integrationsApi.disconnectGoogleCalendar();
      setCalendarMessage(response.message);
      showToast({ type: response.disconnected ? "success" : "info", message: response.message });
      await refreshCalendarStatus();
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setCalendarBusy(false);
    }
  }

  async function saveCalendarSettings() {
    setCalendarBusy(true);
    setError("");
    try {
      const response = await integrationsApi.updateGoogleCalendarSettings({ mode: calendarMode });
      setCalendarMessage(response.message);
      showToast({ type: "success", message: "Configuracao do Google Agenda salva para a familia ativa." });
      await refreshCalendarStatus();
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setCalendarBusy(false);
    }
  }

  async function createFamilyCalendar() {
    setCalendarBusy(true);
    setError("");
    try {
      if (calendarMode !== "family_calendar") {
        await integrationsApi.updateGoogleCalendarSettings({ mode: "family_calendar" });
      }
      const response = await integrationsApi.ensureGoogleFamilyCalendar();
      setCalendarMessage(response.message);
      showToast({ type: response.calendar_id ? "success" : "info", message: response.message });
      await refreshCalendarStatus();
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setCalendarBusy(false);
    }
  }

  async function saveFamilySettings() {
    setError("");
    setSavingFamily(true);
    try {
      const nextName = familyForm.name.trim();
      if (!family) {
        throw new Error("Crie ou entre em uma familia antes de salvar as configuracoes.");
      }
      if (!canAdminFamily) {
        throw new Error("Somente administradores podem alterar as configuracoes da familia.");
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
      showToast({ type: "success", message: "Alteracoes salvas com sucesso." });
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setSavingFamily(false);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm("Excluir sua conta? Esta acao desativa seu acesso e remove voce das familias em que participa.")) return;
    setError("");
    try {
      await deleteAccount();
      navigate("/login", { replace: true });
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    }
  }

  const pushSupported = getBrowserPushSupport();
  const pushPermission = getNotificationPermission();

  return (
    <>
      <PageHeader title="Configuracoes" user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="-mx-3 mb-8 flex scroll-px-3 gap-3 overflow-x-auto border-b border-slate-200 px-3 pb-1">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-h-12 shrink-0 items-center gap-2 rounded-t-2xl px-5 py-4 text-sm font-semibold transition ${
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
                <input className="soft-input" value={familyForm.name} onChange={(event) => setFamilyForm({ name: event.target.value })} placeholder="Nome da familia" disabled={!canAdminFamily} />
              </label>
              {family && !canAdminFamily && (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  Somente administradores podem alterar as configuracoes da familia.
                </p>
              )}
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-muted">Codigo de convite</span>
                <input className="soft-input" value={family?.invite_code || "Carregando..."} readOnly />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-muted">Fuso horario</span>
                <SelectMenu value={preferences.timezone} onChange={(value) => updatePreference("timezone", value)} options={timezoneOptions} />
              </label>
              <Button className="mx-auto flex w-full md:w-64" onClick={saveFamilySettings} disabled={savingFamily || !family || !canAdminFamily || familyForm.name.trim().length < 2}>
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
            <p className="mt-4 text-sm text-muted">
              Sua conta Google continua a mesma. Esta configuracao define em qual agenda os eventos da familia ativa serao criados.
            </p>
            <div className="mt-5 grid gap-3 rounded-2xl bg-white/75 px-4 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-muted">Familia ativa</span>
                <span className="rounded-full bg-blush/10 px-3 py-1 text-xs font-bold text-blush">{family?.name || "Carregando..."}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-muted">Conta Google</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${calendarStatus?.is_connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-muted"}`}>
                  {calendarStatusLoading ? "Verificando..." : calendarStatus?.is_connected ? "Conectada" : "Desconectada"}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">
              {calendarStatusLoading ? "Verificando conexao..." : calendarStatus?.message || "Nao foi possivel consultar a conexao agora."}
            </p>
            {calendarStatus?.is_connected && (
              <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                Sua conta esta conectada. O envio de tarefas continua exigindo confirmacao manual.
              </p>
            )}
            <div className="mt-5 space-y-4 rounded-2xl bg-white/75 px-4 py-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-muted">Modo de sincronizacao desta familia</span>
                <SelectMenu value={calendarMode} onChange={setCalendarMode} options={calendarModeOptions} />
              </label>
              {calendarMode === "family_calendar" && (
                <div className="space-y-3 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
                  <p className="font-bold">Agenda separada da familia</p>
                  <p>
                    {calendarStatus?.calendar_name
                      ? `Agenda atual: ${calendarStatus.calendar_name}`
                      : "Nenhuma agenda separada foi criada para esta familia ainda."}
                  </p>
                  {calendarStatus?.effective_calendar_id && <p className="break-all text-xs font-semibold text-violet-700">ID: {calendarStatus.effective_calendar_id}</p>}
                  <Button type="button" variant="secondary" onClick={createFamilyCalendar} disabled={calendarBusy || !calendarStatus?.is_connected}>
                    <CalendarDays className="h-4 w-4" />
                    {calendarStatus?.family_calendar_configured ? "Conferir agenda da familia" : "Criar agenda da familia"}
                  </Button>
                </div>
              )}
              {calendarMode === "primary" && (
                <p className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                  Os eventos desta familia serao criados na sua agenda principal com o nome da familia no titulo e nos metadados.
                </p>
              )}
              {calendarMode === "disabled" && (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                  A sincronizacao com Google Agenda ficara desativada apenas para esta familia.
                </p>
              )}
              <Button type="button" onClick={saveCalendarSettings} disabled={calendarBusy || !calendarStatus?.is_enabled}>
                <Check className="h-4 w-4" />
                {calendarBusy ? "Salvando..." : "Salvar configuracao"}
              </Button>
            </div>
            {calendarMessage && <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600">{calendarMessage}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              {!calendarStatus?.is_connected && (
                <Button onClick={connectCalendar} disabled={calendarBusy || calendarStatusLoading || !calendarStatus?.is_enabled || !calendarStatus?.can_connect}>
                  <CalendarDays className="h-4 w-4" />
                  {calendarBusy ? "Abrindo Google..." : calendarStatusLoading ? "Verificando..." : calendarStatus?.is_enabled ? "Conectar Google Agenda" : "Google Agenda desativado"}
                </Button>
              )}
              {calendarStatus?.is_connected && (
                <Button variant="secondary" onClick={disconnectCalendar} disabled={calendarBusy}>
                  <Unplug className="h-4 w-4" />
                  {calendarBusy ? "Desconectando..." : "Desconectar"}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <div className="flex items-center gap-3">
              <BellRing className="h-6 w-6 text-blush" />
              <h2 className="section-title">Lembretes internos</h2>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-white/75 px-4 py-4">
                <p className="font-semibold text-ink">Barra de notificacoes</p>
                <p className="mt-1 text-sm text-muted">
                  Os lembretes internos sao gerados pelo backend e aparecem no sino do CasaSync quando a tarefa chega na hora configurada.
                </p>
              </div>
              <Button variant="secondary" onClick={runReminderCheck} disabled={notificationBusy === "reminders"}>
                <RefreshCw className="h-4 w-4" />
                {notificationBusy === "reminders" ? "Verificando..." : "Verificar lembretes agora"}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <Mail className="h-6 w-6 text-blue-600" />
              <h2 className="section-title">Email</h2>
            </div>
            <p className="mt-4 text-sm text-muted">
              {notificationSettings?.email_feature_enabled
                ? notificationSettings?.email_configured
                  ? "Email de lembrete disponivel para esta conta."
                  : "Email esta habilitado, mas SMTP ainda nao foi configurado no servidor."
                : "Email de lembrete esta desativado por configuracao."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                disabled={
                  notificationBusy === "preferences" ||
                  (!notificationSettings?.email_task_reminders_enabled &&
                    (!notificationSettings?.email_feature_enabled || !notificationSettings?.email_configured))
                }
                onClick={() => updateNotificationPreferences({ email_task_reminders_enabled: !notificationSettings?.email_task_reminders_enabled })}
              >
                <Mail className="h-4 w-4" />
                {notificationSettings?.email_task_reminders_enabled ? "Desativar email" : "Ativar email"}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <Smartphone className="h-6 w-6 text-emerald-600" />
              <h2 className="section-title">Notificacao do navegador</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm text-muted">
              <p>
                {notificationSettings?.push_feature_enabled
                  ? notificationSettings?.push_configured
                    ? "Push esta configurado no servidor."
                    : "Push esta habilitado, mas as chaves VAPID ainda nao foram configuradas."
                  : "Push esta desativado por configuracao."}
              </p>
              <p>Permissao do navegador: {getNotificationPermissionLabel(pushPermission)}.</p>
              {!pushSupported && <p className="rounded-2xl bg-amber-50 px-4 py-3 font-semibold text-amber-700">Este navegador nao oferece suporte completo a Web Push.</p>}
              {pushPermission === "denied" && (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 font-semibold text-amber-700">
                  A permissao foi bloqueada. Libere as notificacoes nas configuracoes do navegador para ativar este dispositivo.
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {!devicePushEnabled ? (
                <Button
                  disabled={notificationBusy === "push" || !pushSupported || pushPermission === "denied" || !notificationSettings?.push_feature_enabled || !notificationSettings?.push_configured}
                  onClick={enableBrowserPush}
                >
                  <Smartphone className="h-4 w-4" />
                  {notificationBusy === "push" ? "Solicitando..." : "Ativar neste dispositivo"}
                </Button>
              ) : (
                <Button variant="secondary" disabled={notificationBusy === "push"} onClick={disableBrowserPush}>
                  <Unplug className="h-4 w-4" />
                  {notificationBusy === "push" ? "Desativando..." : "Desativar neste dispositivo"}
                </Button>
              )}
            </div>
            {notificationMessage && <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600">{notificationMessage}</p>}
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
                <p className="mt-2 font-semibold text-ink">{family?.name || "Minha familia"}</p>
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
                <Button type="button" variant="danger" className="mt-4" onClick={handleDeleteAccount}>
                  Excluir conta
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {profileOpen && <ProfileModal user={user} onClose={() => setProfileOpen(false)} onSaved={updateUser} />}
    </>
  );
}

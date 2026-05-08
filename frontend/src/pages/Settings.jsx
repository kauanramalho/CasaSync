import { useEffect, useState } from "react";
import { Bell, CalendarDays, Database, Grid2X2, Palette, RefreshCw, Settings as SettingsIcon, ShieldAlert, User } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { integrationsApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";

const tabs = [
  { label: "Gerais", icon: SettingsIcon },
  { label: "Categorias", icon: Grid2X2 },
  { label: "Notificações", icon: Bell },
  { label: "Aparência", icon: Palette },
  { label: "Conta", icon: User }
];

export default function Settings() {
  const { user } = useAuth();
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    integrationsApi
      .googleCalendarStatus()
      .then(setCalendarStatus)
      .catch((err) => setError(normalizeApiError(err)));
  }, []);

  async function connectCalendar() {
    try {
      const response = await integrationsApi.googleCalendarConnectUrl();
      setCalendarMessage(response.message);
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Configurações" user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="mb-8 flex gap-4 overflow-x-auto border-b border-slate-200 pb-1">
        {tabs.map((tab, index) => (
          <button key={tab.label} className={`flex shrink-0 items-center gap-2 rounded-t-2xl px-5 py-4 text-sm font-semibold ${index === 0 ? "border-b-2 border-blue-400 bg-white text-blue-500" : "text-muted"}`}>
            <tab.icon className="h-5 w-5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="section-title">Configurações gerais</h2>
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-[1fr_220px] md:items-center">
              <p className="font-semibold text-muted">Idioma</p>
              <select className="soft-input">
                <option>Português</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_220px] md:items-center">
              <p className="font-semibold text-muted">Moeda</p>
              <select className="soft-input">
                <option>BRL (R$)</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_220px] md:items-center">
              <p className="font-semibold text-muted">Início da semana</p>
              <select className="soft-input">
                <option>Segunda-feira</option>
              </select>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3">
              <div>
                <p className="font-semibold text-ink">Modo casal</p>
                <p className="text-sm text-muted">Espaço seguro apenas para o casal</p>
              </div>
              <span className="h-7 w-12 rounded-full bg-emerald-400 p-1">
                <span className="block h-5 w-5 translate-x-5 rounded-full bg-white" />
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Sobre a família</h2>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-muted">Nome da família</span>
              <input className="soft-input" defaultValue="Kauan & Bia" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-muted">Data do relacionamento</span>
              <input className="soft-input" defaultValue="12/04/2023" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-muted">Fuso horário</span>
              <select className="soft-input">
                <option>(GMT-03:00) Brasília</option>
              </select>
            </label>
            <Button className="mx-auto flex w-full md:w-64">Salvar alterações</Button>
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
                <p className="font-semibold text-ink">Backup automático</p>
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
                <div className="h-2 w-[12%] rounded-full bg-blue-400" />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-blue-500" />
            <h2 className="section-title">Google Agenda</h2>
          </div>
          <p className="mt-4 text-sm text-muted">{calendarStatus?.message || "Verificando conexão..."}</p>
          {calendarMessage && <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-600">{calendarMessage}</p>}
          <Button onClick={connectCalendar} className="mt-6">
            Conectar Google Agenda
          </Button>
        </Card>

        <Card className="xl:col-span-2">
          <div className="flex items-center gap-3 text-rose-600">
            <ShieldAlert className="h-6 w-6" />
            <h2 className="section-title text-rose-700">Zona de perigo</h2>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-rose-50 px-4 py-4">
              <p className="font-semibold text-rose-600">Redefinir dados</p>
              <p className="mt-1 text-sm text-muted">Esta ação apagará tarefas e categorias da família.</p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-4">
              <p className="font-semibold text-rose-600">Excluir conta</p>
              <p className="mt-1 text-sm text-muted">Ação permanente e irreversível.</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}


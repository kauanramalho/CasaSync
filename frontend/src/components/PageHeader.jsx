import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ChevronDown, LogOut, Settings, Trash2, UserRound } from "lucide-react";

import Avatar from "./Avatar";
import GlobalSearch from "./GlobalSearch";
import ProfileModal from "./ProfileModal";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";

const notificationTone = {
  task: "bg-blue-50 text-blue-600",
  done: "bg-emerald-50 text-emerald-600",
  reopened: "bg-orange-50 text-orange-600",
  couple: "bg-rose-50 text-blush",
  info: "bg-slate-100 text-muted"
};

const notificationLabels = {
  task: "Tarefa",
  done: "Concluida",
  reopened: "Reaberta",
  couple: "Casal",
  info: "Info"
};

export default function PageHeader({ title, subtitle, action, user }) {
  const navigate = useNavigate();
  const { logout, updateUser } = useAuth();
  const [openNotifications, setOpenNotifications] = useState(false);
  const [openUserMenu, setOpenUserMenu] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <GlobalSearch />

        <div className="relative">
          <button
            onClick={() => {
              setOpenNotifications((current) => !current);
              setOpenUserMenu(false);
            }}
            className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white text-muted shadow-card transition hover:-translate-y-0.5 hover:text-ink hover:shadow-soft"
            title="Notificacoes"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-blush px-1 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
          {openNotifications && (
            <div className="absolute right-0 top-14 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-white/80 bg-white/95 shadow-soft backdrop-blur-xl animate-in">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-bold text-ink">Notificacoes</p>
                  <p className="text-xs text-muted">{unreadCount} nao lida(s)</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={markAllAsRead} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-emerald-50 hover:text-emerald-600" title="Marcar como lidas">
                    <CheckCheck className="h-4 w-4" />
                  </button>
                  <button onClick={clearAll} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-rose-50 hover:text-rose-600" title="Limpar todas">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                {notifications.length ? (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => markAsRead(item.id)}
                      className={`w-full rounded-2xl px-3 py-3 text-left transition hover:bg-rose-50/60 ${item.read ? "opacity-70" : "bg-slate-50/70"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.read ? "bg-slate-200" : "bg-blush"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${notificationTone[item.type] || notificationTone.info}`}>
                              {notificationLabels[item.type] || notificationLabels.info}
                            </span>
                            <span className="text-[11px] font-semibold text-muted">
                              {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}
                            </span>
                          </div>
                          <p className="mt-1 font-semibold text-ink">{item.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted">{item.description}</p>
                          {item.actor && <p className="mt-1 text-[11px] font-semibold text-blush">por {item.actor}</p>}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center">
                    <Bell className="mx-auto h-8 w-8 text-rose-200" />
                    <p className="mt-3 font-semibold text-ink">Tudo tranquilo por aqui.</p>
                    <p className="mt-1 text-sm text-muted">As novidades importantes vao aparecer neste cantinho.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setOpenUserMenu((current) => !current);
              setOpenNotifications(false);
            }}
            className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
          >
            <Avatar user={user} />
            <div className="hidden text-left sm:block">
              <p className="text-sm font-bold text-ink">{user?.name || "Usuario"}</p>
              <p className="text-xs text-muted">{user?.username ? `@${user.username}` : "Ver perfil"}</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted transition ${openUserMenu ? "rotate-180 text-blush" : ""}`} />
          </button>

          {openUserMenu && (
            <div className="absolute right-0 top-14 z-50 w-64 overflow-hidden rounded-[24px] border border-white/80 bg-white/95 p-2 shadow-soft backdrop-blur-xl animate-in">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(true);
                  setOpenUserMenu(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-ink transition hover:bg-rose-50 hover:text-blush"
              >
                <UserRound className="h-4 w-4" />
                Ver perfil
              </button>
              <button
                type="button"
                onClick={() => navigate("/configuracoes")}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-ink transition hover:bg-blue-50 hover:text-blue-600"
              >
                <Settings className="h-4 w-4" />
                Configuracoes
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          )}
        </div>

        {action}
      </div>

      {profileOpen && <ProfileModal user={user} onClose={() => setProfileOpen(false)} onSaved={updateUser} />}
    </header>
  );
}

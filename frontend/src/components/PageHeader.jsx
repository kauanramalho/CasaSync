import { useState } from "react";
import { Bell, CheckCheck, ChevronDown, Search, Trash2 } from "lucide-react";

import Avatar from "./Avatar";
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
  done: "Concluída",
  reopened: "Reaberta",
  couple: "Casal",
  info: "Info"
};

export default function PageHeader({ title, subtitle, action, user }) {
  const [openNotifications, setOpenNotifications] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();

  return (
    <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 lg:w-80 lg:flex-none">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input className="soft-input pl-12" placeholder="Buscar tarefas..." />
        </div>
        <div className="relative">
          <button
            onClick={() => setOpenNotifications((current) => !current)}
            className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white text-muted shadow-card hover:text-ink"
            title="Notificações"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-blush px-1 text-[11px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
          {openNotifications && (
            <div className="absolute right-0 top-14 z-40 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-soft">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-bold text-ink">Notificações</p>
                  <p className="text-xs text-muted">{unreadCount} não lida(s)</p>
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
                    <p className="mt-1 text-sm text-muted">As novidades importantes vão aparecer neste cantinho.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-card">
          <Avatar user={user} />
          <div className="hidden sm:block">
            <p className="text-sm font-bold text-ink">{user?.name || "Usuário"}</p>
            <p className="text-xs text-muted">Ver perfil</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted" />
        </div>
        {action}
      </div>
    </header>
  );
}

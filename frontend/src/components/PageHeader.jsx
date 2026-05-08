import { Bell, ChevronDown, Search } from "lucide-react";

import Avatar from "./Avatar";

export default function PageHeader({ title, subtitle, action, user }) {
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
        <button className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white text-muted shadow-card">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-blush text-[11px] font-bold text-white">3</span>
        </button>
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


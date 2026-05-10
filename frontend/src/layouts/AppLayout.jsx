import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Folder,
  Heart,
  Home,
  LogOut,
  Medal,
  Settings,
  Users
} from "lucide-react";

import LogoMark from "../components/LogoMark";
import ProgressRing from "../components/ProgressRing";
import { useAuth } from "../hooks/useAuth";
import { dashboardApi, familiesApi } from "../services/api";
import { APP_DATA_CHANGED_EVENT } from "../utils/events";

const navItems = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/categorias", label: "Categorias", icon: Folder },
  { to: "/familia", label: "Membros", icon: Users },
  { to: "/ranking", label: "Ranking", icon: Medal },
  { to: "/espaco-do-casal", label: "Espaço do Casal", icon: Heart },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings }
];

export default function AppLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [family, setFamily] = useState(null);
  const [sidebarMetrics, setSidebarMetrics] = useState({ done: 0, total: 0, points: 0 });

  useEffect(() => {
    let alive = true;

    async function loadSidebarData() {
      try {
        const [familyResult, dashboard] = await Promise.allSettled([familiesApi.current(), dashboardApi.get()]);
        if (!alive) return;
        if (familyResult.status === "fulfilled") setFamily(familyResult.value);
        if (familyResult.status === "rejected") setFamily(null);
        if (dashboard.status === "fulfilled") {
          const stats = dashboard.value.stats;
          const done = stats.find((item) => item.key === "done")?.value ?? 0;
          const pending = stats.find((item) => item.key === "pending")?.value ?? 0;
          const overdue = stats.find((item) => item.key === "overdue")?.value ?? 0;
          const points = stats.find((item) => item.key === "points")?.value ?? 0;
          setSidebarMetrics({ done, total: done + pending + overdue, points });
        }
      } catch {
        setFamily(null);
      }
    }

    loadSidebarData();
    window.addEventListener(APP_DATA_CHANGED_EVENT, loadSidebarData);
    return () => {
      alive = false;
      window.removeEventListener(APP_DATA_CHANGED_EVENT, loadSidebarData);
    };
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="sticky top-0 z-20 hidden h-screen flex-col border-r border-white/80 bg-white/70 p-6 shadow-soft backdrop-blur-xl lg:flex">
        <LogoMark subtitle={family?.name || "Minha familia"} />
        {family && <p className="mt-2 pl-[60px] text-xs font-medium text-muted">Código: {family.invite_code}</p>}

        <nav className="mt-10 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isActive ? "bg-gradient-to-r from-peach/10 to-blush/10 text-blush" : "text-muted hover:bg-white hover:text-ink"
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 rounded-[24px] bg-white/80 p-5 shadow-card">
          <p className="text-sm font-semibold text-ink">Progresso da familia</p>
          <div className="mt-5 flex items-center gap-4">
            <ProgressRing value={sidebarMetrics.total ? Math.round((sidebarMetrics.done / sidebarMetrics.total) * 100) : 0} />
            <div>
              <p className="font-semibold text-ink">{sidebarMetrics.done} / {sidebarMetrics.total} tarefas</p>
              <p className="mt-1 text-xs text-muted">{sidebarMetrics.points} pontos</p>
            </div>
          </div>
        </div>

        <button onClick={handleLogout} className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-muted hover:bg-white">
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      <div className="flex min-h-screen flex-col">
        <div className="sticky top-0 z-10 border-b border-white/70 bg-white/75 px-4 py-3 backdrop-blur-xl lg:hidden">
          <LogoMark subtitle={family?.name || "Minha familia"} />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold ${
                    isActive ? "bg-blush/10 text-blush" : "bg-white text-muted"
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
        <main className="flex-1 px-4 py-6 md:px-8 lg:px-10 lg:py-8">
          <Outlet />
        </main>
        <footer className="pb-8 text-center text-sm text-muted">CasaSync © 2026 · Feito com amor para nós</footer>
      </div>
    </div>
  );
}

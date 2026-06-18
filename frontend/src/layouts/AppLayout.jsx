import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
import SelectMenu from "../components/SelectMenu";
import { useActiveFamily } from "../hooks/useActiveFamily";
import { useAuth } from "../hooks/useAuth";
import { dashboardApi } from "../services/api";
import { APP_DATA_CHANGED_EVENT, APP_RESUMED_EVENT } from "../utils/events";

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

const CREATE_FAMILY_ACTION = "__create_family";
const JOIN_FAMILY_ACTION = "__join_family";

function roleLabel(role) {
  if (role === "owner") return "Proprietario";
  if (role === "admin") return "Administrador";
  return "Membro";
}

export default function AppLayout() {
  const { logout } = useAuth();
  const { activeFamily, error: familyError, families, loading: familyLoading, switchFamily, switching } = useActiveFamily();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarMetrics, setSidebarMetrics] = useState({ done: 0, total: 0, points: 0 });
  const familyOptions = useMemo(
    () => [
      ...families.map((familyItem) => ({
        value: familyItem.id,
        label: familyItem.name,
        helper: familyItem.current_user_role
          ? `${roleLabel(familyItem.current_user_role)}${familyItem.invite_code ? ` - Codigo ${familyItem.invite_code}` : ""}`
          : familyItem.invite_code ? `Codigo ${familyItem.invite_code}` : "Familia CasaSync"
      })),
      { value: CREATE_FAMILY_ACTION, label: "Criar nova familia", helper: "Comecar outro grupo" },
      { value: JOIN_FAMILY_ACTION, label: "Entrar por codigo", helper: "Enviar solicitacao para outra familia" }
    ],
    [families]
  );
  const sidebarProgress = useMemo(
    () => (sidebarMetrics.total ? Math.round((sidebarMetrics.done / sidebarMetrics.total) * 100) : 0),
    [sidebarMetrics.done, sidebarMetrics.total]
  );

  useEffect(() => {
    let alive = true;

    async function loadSidebarData() {
      if (!activeFamily?.id) {
        setSidebarMetrics({ done: 0, total: 0, points: 0 });
        return;
      }
      try {
        const summary = await dashboardApi.summary();
        if (!alive) return;
        const done = summary.done ?? 0;
        const pending = summary.pending ?? 0;
        const overdue = summary.overdue ?? 0;
        setSidebarMetrics({
          done,
          total: summary.total ?? done + pending + overdue,
          points: summary.points ?? 0
        });
      } catch {
        setSidebarMetrics({ done: 0, total: 0, points: 0 });
      }
    }

    loadSidebarData();
    window.addEventListener(APP_DATA_CHANGED_EVENT, loadSidebarData);
    window.addEventListener(APP_RESUMED_EVENT, loadSidebarData);
    return () => {
      alive = false;
      window.removeEventListener(APP_DATA_CHANGED_EVENT, loadSidebarData);
      window.removeEventListener(APP_RESUMED_EVENT, loadSidebarData);
    };
  }, [activeFamily?.id]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function handleFamilyChange(familyId) {
    if (switching) return;
    if (familyId === CREATE_FAMILY_ACTION || familyId === JOIN_FAMILY_ACTION) {
      navigate("/familia");
      return;
    }
    switchFamily(familyId).catch(() => undefined);
  }

  function FamilySwitcher({ compact = false }) {
    if (familyLoading) {
      return <div className="mt-4 rounded-[22px] bg-white/70 px-4 py-3 text-xs font-semibold text-muted shadow-card">Carregando familias...</div>;
    }

    if (!families.length) {
      return (
        <div className="mt-4 rounded-[22px] border border-amber-100 bg-amber-50/80 px-4 py-3 text-xs font-semibold text-amber-700">
          Crie ou entre em uma familia para continuar.
        </div>
      );
    }

    return (
      <div className={compact ? "mt-3 rounded-[22px] bg-white/80 p-3 shadow-card" : "mt-5 rounded-[24px] bg-white/80 p-4 shadow-card"}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Familia ativa</p>
          {switching && <span className="text-[11px] font-semibold text-blush">Trocando...</span>}
        </div>
        <SelectMenu
          value={activeFamily?.id || ""}
          options={familyOptions}
          onChange={handleFamilyChange}
          placeholder="Escolher familia"
          buttonClassName={compact ? "min-h-[44px] rounded-2xl text-sm" : "min-h-[46px] rounded-2xl"}
        />
        {activeFamily?.invite_code && <p className="mt-2 text-xs font-medium text-muted">Codigo: {activeFamily.invite_code}</p>}
        {familyError && <p className="mt-2 text-xs font-semibold text-red-500">{familyError}</p>}
        {!compact && (
          <button
            type="button"
            onClick={() => navigate("/familia")}
            className="mt-3 w-full rounded-2xl bg-blush/10 px-3 py-2 text-xs font-bold text-blush transition hover:bg-blush/15"
          >
            Gerenciar familias
          </button>
        )}
      </div>
    );
  }

  const showNoFamilyState = !familyLoading && !families.length && location.pathname !== "/familia";

  return (
    <div className="min-h-screen min-h-dvh lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 hidden h-screen h-dvh flex-col border-r border-white/80 bg-white/70 p-6 shadow-soft backdrop-blur-xl lg:flex">
        <LogoMark subtitle={activeFamily?.name || "Minha familia"} />
        <FamilySwitcher />

        <nav className="mt-8 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
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
            <ProgressRing value={sidebarProgress} />
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

      <div className="flex min-h-screen min-h-dvh min-w-0 flex-col">
        <div className="sticky top-0 z-10 border-b border-white/70 bg-white/75 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
          <LogoMark subtitle={activeFamily?.name || "Minha familia"} />
          <FamilySwitcher compact />
          <div className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-2xl px-3 py-2 text-xs font-semibold ${
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
        <main className="min-w-0 flex-1 overflow-x-hidden px-3 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-4 md:px-8 lg:px-10 lg:py-8">
          {showNoFamilyState ? (
            <div className="mx-auto grid min-h-[60vh] max-w-2xl place-items-center text-center">
              <div className="rounded-[28px] bg-white/85 p-8 shadow-soft">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">CasaSync</p>
                <h1 className="mt-3 text-3xl font-bold text-ink">Crie ou entre em uma familia</h1>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  As tarefas, categorias, membros e notificacoes aparecem depois que uma familia estiver ativa.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/familia")}
                  className="mt-6 rounded-2xl bg-gradient-to-r from-blush to-peach px-5 py-3 text-sm font-bold text-white shadow-card transition hover:-translate-y-0.5"
                >
                  Abrir familias
                </button>
              </div>
            </div>
          ) : (
            <Outlet key={activeFamily?.id || "sem-familia"} />
          )}
        </main>
        <footer className="px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-sm text-muted">CasaSync © 2026 · Feito com amor para nós</footer>
      </div>
    </div>
  );
}

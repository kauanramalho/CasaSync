import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Camera,
  CheckCircle2,
  Copy,
  Crown,
  DoorOpen,
  ImagePlus,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";

import Avatar from "../components/Avatar";
import Button from "../components/Button";
import Card from "../components/Card";
import ImageAdjustField from "../components/ImageAdjustField";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { dashboardApi, familiesApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";

function isAdminRole(role) {
  return role === "owner" || role === "admin";
}

function roleLabel(role) {
  if (role === "owner") return "Proprietario";
  return isAdminRole(role) ? "Administrador" : "Membro";
}

function dateKey(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function Family() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const familyImageRef = useRef(null);
  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [monthlyRanking, setMonthlyRanking] = useState([]);
  const [dashboardStats, setDashboardStats] = useState([]);
  const [weeklyProductivity, setWeeklyProductivity] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [familyForm, setFamilyForm] = useState({ name: "", description: "", image_url: "" });
  const [activeWeeklyDay, setActiveWeeklyDay] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leavingFamily, setLeavingFamily] = useState(false);
  const [decidingRequestId, setDecidingRequestId] = useState("");
  const [savingFamily, setSavingFamily] = useState(false);

  const load = useCallback(async function load() {
    setError("");
    try {
      const familyRows = await familiesApi.list();
      if (familyRows.length) {
        const [currentFamily, memberRows, dashboardRows] = await Promise.all([familiesApi.current(), familiesApi.members(), dashboardApi.get()]);
        const activeMember = memberRows.find((member) => member.user_id === user?.id);
        const requestRows = isAdminRole(activeMember?.role) ? await familiesApi.joinRequests() : [];
        setFamilies([currentFamily, ...familyRows.filter((family) => family.id !== currentFamily.id)]);
        setMembers(memberRows);
        setMonthlyRanking(dashboardRows.ranking || []);
        setDashboardStats(dashboardRows.stats || []);
        setWeeklyProductivity(dashboardRows.weekly_productivity || []);
        setJoinRequests(requestRows);
        setTasks(dashboardRows.recent_tasks || []);
      } else {
        setFamilies([]);
        setMembers([]);
        setMonthlyRanking([]);
        setDashboardStats([]);
        setWeeklyProductivity([]);
        setJoinRequests([]);
        setTasks([]);
      }
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const currentFamily = families[0];
  const currentMember = members.find((member) => member.user_id === user?.id);
  const canAdmin = isAdminRole(currentMember?.role);
  const canOwner = currentMember?.role === "owner";

  useEffect(() => {
    setFamilyForm({
      name: currentFamily?.name || "",
      description: currentFamily?.description || "",
      image_url: currentFamily?.image_url || ""
    });
  }, [currentFamily]);

  const stats = useMemo(() => {
    const completed = tasks.filter((task) => task.status === "concluida");
    return {
      totalPoints: monthlyRanking.reduce((sum, member) => sum + member.points, 0),
      completed: dashboardStats.find((item) => item.key === "done")?.value ?? completed.length,
      active: dashboardStats.find((item) => item.key === "pending")?.value ?? tasks.filter((task) => ["pendente", "em_andamento"].includes(task.status)).length,
      overdue: dashboardStats.find((item) => item.key === "overdue")?.value ?? tasks.filter((task) => task.status === "atrasada").length,
      weeklyCompleted: weeklyProductivity.length ? weeklyProductivity.reduce((sum, item) => sum + (item.done ?? item.tasks?.length ?? 0), 0) : completed.length
    };
  }, [dashboardStats, monthlyRanking, tasks, weeklyProductivity]);
  const rankingByUser = useMemo(() => {
    return monthlyRanking.reduce((acc, item) => {
      acc[item.user.id] = item;
      return acc;
    }, {});
  }, [monthlyRanking]);

  const recentActivity = useMemo(() => [...tasks].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 5), [tasks]);
  const weeklyBars = useMemo(() => {
    if (weeklyProductivity.length) {
      return weeklyProductivity.map((item) => ({
        key: item.date,
        label: item.label,
        date: item.label,
        total: item.done ?? item.tasks?.length ?? 0
      }));
    }
    const today = new Date();
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      const total = tasks.filter((task) => task.status === "concluida" && dateKey(task.completed_at) === key).length;
      return { key, label: date.toLocaleDateString("pt-BR", { weekday: "short" }), date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), total };
    });
  }, [tasks, weeklyProductivity]);
  const weeklyMax = useMemo(() => Math.max(1, ...weeklyBars.map((item) => item.total)), [weeklyBars]);

  async function createFamily(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await familiesApi.create({ name: familyName.trim() });
      setFamilyName("");
      setMessage("Familia criada com sucesso.");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function joinFamily(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await familiesApi.join({ invite_code: inviteCode.trim() });
      setInviteCode("");
      setMessage("Solicitacao enviada. Um administrador precisa aprovar sua entrada na familia.");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function updateFamily(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSavingFamily(true);
    try {
      if (!currentFamily) {
        throw new Error("Crie ou entre em uma familia antes de salvar as configuracoes.");
      }
      if (!canAdmin) {
        throw new Error("Somente administradores podem alterar as configuracoes da familia.");
      }
      const nextName = familyForm.name.trim();
      if (nextName.length < 2) {
        throw new Error("Informe um nome de familia com pelo menos 2 caracteres.");
      }
      const imageUrl = await familyImageRef.current?.getValue();
      const updated = await familiesApi.updateCurrent({
        name: nextName,
        description: familyForm.description.trim() || null,
        image_url: imageUrl
      });
      setFamilies((current) => [updated, ...current.filter((family) => family.id !== updated.id)]);
      setFamilyForm({
        name: updated.name || "",
        description: updated.description || "",
        image_url: updated.image_url || ""
      });
      familyImageRef.current?.resetDraft();
      setMessage("Configuracoes da familia atualizadas.");
      showToast({ type: "success", message: "Configuracoes da familia atualizadas." });
      emitAppDataChanged();
      load();
    } catch (err) {
      const message = normalizeApiError(err);
      setError(message);
      showToast({ type: "error", message });
    } finally {
      setSavingFamily(false);
    }
  }

  async function regenerateCode() {
    setMessage("");
    setError("");
    try {
      const updated = await familiesApi.regenerateCode();
      setFamilies((current) => [updated, ...current.filter((family) => family.id !== updated.id)]);
      setMessage("Novo codigo de convite gerado.");
      emitAppDataChanged();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function copyInviteCode() {
    if (!currentFamily?.invite_code) return;
    setError("");
    try {
      await navigator.clipboard?.writeText(currentFamily.invite_code);
      setMessage("Codigo copiado.");
    } catch {
      setError("Nao foi possivel copiar o codigo automaticamente.");
    }
  }

  async function updateMemberRole(member, role) {
    setMessage("");
    setError("");
    try {
      await familiesApi.updateMember(member.id, { role });
      setMessage("Permissao do membro atualizada.");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function removeMember(member) {
    setMessage("");
    setError("");
    try {
      await familiesApi.removeMember(member.id);
      setMessage("Membro removido da familia.");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function deleteFamily() {
    if (!window.confirm("Excluir esta familia e todos os dados vinculados?")) return;
    setMessage("");
    setError("");
    try {
      await familiesApi.deleteCurrent();
      setMessage("Familia excluida.");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function decideJoinRequest(request, approve) {
    setDecidingRequestId(request.id);
    setMessage("");
    setError("");
    try {
      if (approve) {
        await familiesApi.approveJoinRequest(request.id);
        setMessage(`${request.requester?.name || "Solicitante"} agora faz parte da familia.`);
      } else {
        await familiesApi.rejectJoinRequest(request.id);
        setMessage("Solicitacao recusada.");
      }
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setDecidingRequestId("");
    }
  }

  async function confirmLeaveFamily() {
    setLeavingFamily(true);
    setMessage("");
    setError("");
    try {
      await familiesApi.leaveCurrent();
      setLeaveDialogOpen(false);
      setMessage("Voce saiu da familia.");
      emitAppDataChanged();
      navigate("/familia");
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLeavingFamily(false);
    }
  }

  return (
    <>
      <PageHeader title="Familia" subtitle="Gerencie membros, convites e o grupo principal do CasaSync." user={user} />

      {(message || error) && (
        <p className={`mb-5 rounded-2xl px-4 py-3 text-sm font-semibold ${error ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
          {error || message}
        </p>
      )}

      {currentFamily && (
        <Card className="mb-6 overflow-hidden bg-gradient-to-br from-white via-rose-50/40 to-blue-50/50">
          <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[26px] bg-gradient-to-br from-rose-100 to-violet-100 shadow-card">
                {currentFamily.image_url ? <img src={currentFamily.image_url} alt={currentFamily.name} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-3xl font-bold text-blush">{currentFamily.name?.[0]}</div>}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-2xl font-bold text-ink">{currentFamily.name}</h2>
                  {canAdmin && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><ShieldCheck className="h-3 w-3" /> admin</span>}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{currentFamily.description || "Casa organizada, rotina mais leve e um ranking para manter todo mundo junto."}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={copyInviteCode} className="flex min-w-0 items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-card transition hover:-translate-y-0.5 hover:bg-rose-50">
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-muted">Convite</span>
                  <span className="block truncate font-bold text-blush">{currentFamily.invite_code}</span>
                </span>
                <Copy className="h-5 w-5 text-blush" />
              </button>
              {canAdmin && (
                <button onClick={regenerateCode} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-ink shadow-card transition hover:-translate-y-0.5 hover:bg-blue-50 hover:text-blue-600">
                  <RefreshCcw className="h-4 w-4" />
                  Novo codigo
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {currentFamily && canAdmin && (
        <Card className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600 shadow-card">
                <UserPlus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="section-title">Solicitacoes de entrada</h2>
                <p className="text-sm text-muted">A entrada por codigo fica pendente ate um administrador aprovar.</p>
              </div>
            </div>
            <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 md:self-auto">
              {joinRequests.length} pendente(s)
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {joinRequests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-[22px] border border-slate-100 bg-white/75 p-4 shadow-card md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar user={request.requester} />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{request.requester?.name || "Novo membro"}</p>
                    <p className="truncate text-sm text-muted">{request.requester?.email || "E-mail nao informado"}</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:w-auto">
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-3 py-2 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => decideJoinRequest(request, true)}
                    disabled={decidingRequestId === request.id}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="px-3 py-2"
                    onClick={() => decideJoinRequest(request, false)}
                    disabled={decidingRequestId === request.id}
                  >
                    <XCircle className="h-4 w-4" />
                    Recusar
                  </Button>
                </div>
              </div>
            ))}
            {!joinRequests.length && <p className="empty-state">Nenhuma solicitacao pendente no momento.</p>}
          </div>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.25fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="section-title">Criar familia</h2>
            <form onSubmit={createFamily} className="mt-5 space-y-4">
              <input className="soft-input" placeholder="Nome da familia" value={familyName} onChange={(event) => setFamilyName(event.target.value)} required />
              <Button type="submit" className="w-full">
                <Plus className="h-5 w-5" />
                Criar familia
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="section-title">Entrar por convite</h2>
            <form onSubmit={joinFamily} className="mt-5 space-y-4">
              <input className="soft-input uppercase" placeholder="CODIGO DE CONVITE" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} required />
              <Button type="submit" variant="secondary" className="w-full">
                <DoorOpen className="h-5 w-5" />
                Solicitar entrada
              </Button>
            </form>
          </Card>

          {currentFamily && (
            <Card>
              <h2 className="section-title">Configuracoes da familia</h2>
              <form onSubmit={updateFamily} className="mt-5 space-y-4">
                {!canAdmin && (
                  <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                    Somente administradores podem alterar estas configuracoes.
                  </p>
                )}
                <ImageAdjustField
                  ref={familyImageRef}
                  value={familyForm.image_url}
                  label="Imagem da familia"
                  chooseLabel="Escolher imagem"
                  removeLabel="Remover imagem"
                  previewClassName="h-20 w-20 rounded-2xl"
                  emptyLabel={<Camera className="h-7 w-7 text-blush" />}
                  disabled={!canAdmin}
                  onError={(message) => {
                    setError(message);
                    showToast({ type: "error", message });
                  }}
                  onRemove={() => setFamilyForm((current) => ({ ...current, image_url: "" }))}
                />
                <input className="soft-input" value={familyForm.name} onChange={(event) => setFamilyForm((current) => ({ ...current, name: event.target.value }))} disabled={!canAdmin} />
                <textarea className="soft-input min-h-28 resize-none" placeholder="Descricao" value={familyForm.description} onChange={(event) => setFamilyForm((current) => ({ ...current, description: event.target.value }))} disabled={!canAdmin} />
                <Button type="submit" className="w-full" disabled={!canAdmin || savingFamily || familyForm.name.trim().length < 2}>
                  <ImagePlus className="h-5 w-5" />
                  {savingFamily ? "Salvando..." : "Salvar configuracoes"}
                </Button>
                {canOwner && (
                  <Button type="button" variant="danger" className="w-full" onClick={deleteFamily}>
                    <Trash2 className="h-5 w-5" />
                    Excluir familia
                  </Button>
                )}
              </form>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="surface-hover">
              <Users className="h-5 w-5 text-blush" />
              <p className="mt-3 text-2xl font-bold text-ink">{members.length}</p>
              <p className="text-xs font-bold text-muted">membros</p>
            </Card>
            <Card className="surface-hover">
              <Trophy className="h-5 w-5 text-orange-500" />
              <p className="mt-3 text-2xl font-bold text-ink">{stats.totalPoints}</p>
              <p className="text-xs font-bold text-muted">pontos no mes</p>
            </Card>
            <Card className="surface-hover">
              <Activity className="h-5 w-5 text-emerald-500" />
              <p className="mt-3 text-2xl font-bold text-ink">{stats.completed}</p>
              <p className="text-xs font-bold text-muted">concluidas</p>
            </Card>
            <Card className="surface-hover">
              <ShieldCheck className="h-5 w-5 text-violet-500" />
              <p className="mt-3 text-2xl font-bold text-ink">{stats.weeklyCompleted}</p>
              <p className="text-xs font-bold text-muted">na semana</p>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">{currentFamily?.name || "Nenhuma familia ativa"}</h2>
                <p className="mt-2 text-sm text-muted">Membros, cargos e ranking familiar.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {currentFamily && <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-blush">{stats.active} tarefas ativas</span>}
                {currentFamily && currentMember && (
                  <Button type="button" variant="danger" className="px-3 py-2" onClick={() => setLeaveDialogOpen(true)}>
                    <DoorOpen className="h-4 w-4" />
                    Sair da familia
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {members.map((member, index) => (
                <div key={member.id} className="rounded-[24px] bg-white/75 p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar user={member.user} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">{member.user.name}</p>
                        <p className="text-sm text-muted">{roleLabel(member.role)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 text-orange-500">
                        {isAdminRole(member.role) ? <Crown className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                        <span className="text-sm font-bold">{rankingByUser[member.user_id]?.points ?? 0} pts</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">#{rankingByUser[member.user_id]?.position ?? index + 1} no mes</p>
                    </div>
                  </div>
                  {canAdmin && member.role !== "owner" && member.user_id !== user?.id && (canOwner || member.role === "member") && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                      {canOwner ? (
                        <SelectMenu
                          value={member.role === "admin" ? "admin" : "member"}
                          onChange={(role) => updateMemberRole(member, role)}
                          options={[
                            { value: "admin", label: "Admin", helper: "Pode gerenciar" },
                            { value: "member", label: "Membro", helper: "Uso normal" }
                          ]}
                        />
                      ) : (
                        <span className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-muted">Membro comum</span>
                      )}
                      <button type="button" onClick={() => removeMember(member)} className="inline-flex items-center justify-center rounded-2xl bg-rose-50 px-3 text-rose-600 hover:bg-rose-100">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!members.length && <p className="empty-state md:col-span-2">Crie ou entre em uma familia para ver os membros.</p>}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="section-title">Produtividade semanal</h2>
              <div className="chart-frame mt-5 flex h-52 items-end gap-3 p-4">
                {weeklyBars.map((bar, index) => {
                  const height = bar.total ? Math.max(14, (bar.total / weeklyMax) * 100) : 0;
                  const active = activeWeeklyDay === bar.key;
                  return (
                    <button
                      key={bar.key}
                      type="button"
                      onMouseEnter={() => setActiveWeeklyDay(bar.key)}
                      onMouseLeave={() => setActiveWeeklyDay(null)}
                      onFocus={() => setActiveWeeklyDay(bar.key)}
                      onBlur={() => setActiveWeeklyDay(null)}
                      className="group relative flex min-w-0 flex-1 flex-col items-center gap-2 rounded-2xl focus-visible:outline-none"
                    >
                      {active && (
                        <span
                          className={`absolute -top-10 z-10 w-max max-w-[8rem] rounded-2xl border border-slate-100 bg-white/95 px-3 py-2 text-center text-xs font-bold text-ink shadow-card ${
                            index === 0 ? "left-0" : index === weeklyBars.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                          }`}
                        >
                          {bar.date}: {bar.total} concluidas
                        </span>
                      )}
                      <span className="relative flex h-32 w-full items-end overflow-hidden rounded-[22px] border border-slate-100 bg-white/80 p-1.5 shadow-inner">
                        <span className="absolute inset-x-0 top-2 text-center text-[11px] font-black tabular-nums text-muted">{bar.total}</span>
                        <span
                          className="w-full rounded-[18px] bg-gradient-to-t from-blush via-violet-400 to-peach shadow-card transition-all duration-300 group-hover:brightness-110"
                          style={{ height: `${height}%`, opacity: bar.total ? 1 : 0 }}
                        />
                      </span>
                      <span className="text-[11px] font-bold uppercase text-muted">{bar.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <h2 className="section-title">Atividade recente</h2>
              <div className="mt-5 max-h-48 space-y-3 overflow-y-auto pr-1">
                {recentActivity.map((task) => (
                  <div key={task.id} className="rounded-2xl bg-white/80 px-4 py-3 shadow-card">
                    <p className="truncate text-sm font-bold text-ink">{task.title}</p>
                    <p className="mt-1 text-xs font-semibold text-muted">{task.status} - {task.category?.name || "sem categoria"}</p>
                  </div>
                ))}
                {!recentActivity.length && <p className="empty-state">Sem atividade recente ainda.</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {leaveDialogOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !leavingFamily) setLeaveDialogOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-surface p-6 shadow-soft" onMouseDown={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-ink">Sair da familia?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Tem certeza que deseja sair desta familia? Voce perdera acesso as tarefas, ranking e informacoes compartilhadas desta familia.
            </p>
            {isAdminRole(currentMember?.role) && (
              <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
                Se voce for o unico administrador, sera preciso promover outro membro antes de sair.
              </p>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="secondary" onClick={() => setLeaveDialogOpen(false)} disabled={leavingFamily}>
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={confirmLeaveFamily} disabled={leavingFamily}>
                {leavingFamily ? "Saindo..." : "Confirmar saida"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

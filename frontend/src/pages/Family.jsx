import { useEffect, useMemo, useState } from "react";
import { Activity, Camera, Copy, Crown, DoorOpen, ImagePlus, Plus, RefreshCcw, ShieldCheck, Trash2, Trophy, Users } from "lucide-react";

import Avatar from "../components/Avatar";
import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import { useAuth } from "../hooks/useAuth";
import { familiesApi, tasksApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { normalizeApiError } from "../utils/formatters";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isAdminRole(role) {
  return role === "owner" || role === "admin";
}

function roleLabel(role) {
  return isAdminRole(role) ? "Administrador" : "Membro";
}

function dateKey(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default function Family() {
  const { user } = useAuth();
  const [families, setFamilies] = useState([]);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [familyName, setFamilyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [familyForm, setFamilyForm] = useState({ name: "", description: "", image_url: "" });
  const [activeWeeklyDay, setActiveWeeklyDay] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const familyRows = await familiesApi.list();
      if (familyRows.length) {
        const [currentFamily, memberRows, taskRows] = await Promise.all([familiesApi.current(), familiesApi.members(), tasksApi.list()]);
        setFamilies([currentFamily, ...familyRows.filter((family) => family.id !== currentFamily.id)]);
        setMembers(memberRows);
        setTasks(taskRows);
      } else {
        setFamilies([]);
        setMembers([]);
        setTasks([]);
      }
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const currentFamily = families[0];
  const currentMember = members.find((member) => member.user_id === user?.id);
  const canAdmin = isAdminRole(currentMember?.role);

  useEffect(() => {
    setFamilyForm({
      name: currentFamily?.name || "",
      description: currentFamily?.description || "",
      image_url: currentFamily?.image_url || ""
    });
  }, [currentFamily]);

  const stats = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    const completed = tasks.filter((task) => task.status === "concluida");
    return {
      totalPoints: members.reduce((sum, member) => sum + member.points, 0),
      completed: completed.length,
      active: tasks.filter((task) => ["pendente", "em_andamento"].includes(task.status)).length,
      overdue: tasks.filter((task) => task.status === "atrasada").length,
      weeklyCompleted: completed.filter((task) => {
        const completedAt = task.completed_at ? new Date(task.completed_at) : null;
        return completedAt && completedAt >= weekAgo;
      }).length
    };
  }, [members, tasks]);

  const recentActivity = useMemo(() => [...tasks].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 5), [tasks]);
  const weeklyBars = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      const total = tasks.filter((task) => task.status === "concluida" && dateKey(task.completed_at) === key).length;
      return { key, label: date.toLocaleDateString("pt-BR", { weekday: "short" }), date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), total };
    });
  }, [tasks]);
  const weeklyMax = useMemo(() => Math.max(1, ...weeklyBars.map((item) => item.total)), [weeklyBars]);

  async function createFamily(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await familiesApi.create({ name: familyName });
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
      await familiesApi.join({ invite_code: inviteCode });
      setInviteCode("");
      setMessage("Voce entrou na familia.");
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
    try {
      const updated = await familiesApi.updateCurrent({ ...familyForm, name: familyForm.name.trim() });
      setFamilies((current) => [updated, ...current.filter((family) => family.id !== updated.id)]);
      setMessage("Configuracoes da familia atualizadas.");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function handleFamilyImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setFamilyForm((current) => ({ ...current, image_url: dataUrl }));
  }

  async function regenerateCode() {
    const updated = await familiesApi.regenerateCode();
    setFamilies([updated]);
    setMessage("Novo codigo de convite gerado.");
    emitAppDataChanged();
  }

  async function copyInviteCode() {
    if (!currentFamily?.invite_code) return;
    await navigator.clipboard?.writeText(currentFamily.invite_code);
    setMessage("Codigo copiado.");
  }

  async function updateMemberRole(member, role) {
    await familiesApi.updateMember(member.id, { role });
    load();
  }

  async function removeMember(member) {
    await familiesApi.removeMember(member.id);
    load();
  }

  async function deleteFamily() {
    if (!window.confirm("Excluir esta familia e todos os dados vinculados?")) return;
    await familiesApi.deleteCurrent();
    setMessage("Familia excluida.");
    emitAppDataChanged();
    load();
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
            <div className="flex items-center gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[26px] bg-gradient-to-br from-rose-100 to-violet-100 shadow-card">
                {currentFamily.image_url ? <img src={currentFamily.image_url} alt={currentFamily.name} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-3xl font-bold text-blush">{currentFamily.name?.[0]}</div>}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold text-ink">{currentFamily.name}</h2>
                  {canAdmin && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><ShieldCheck className="h-3 w-3" /> admin</span>}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{currentFamily.description || "Casa organizada, rotina mais leve e um ranking para manter todo mundo junto."}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={copyInviteCode} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-card transition hover:-translate-y-0.5 hover:bg-rose-50">
                <span>
                  <span className="block text-xs font-bold text-muted">Convite</span>
                  <span className="font-bold text-blush">{currentFamily.invite_code}</span>
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
                Entrar na familia
              </Button>
            </form>
          </Card>

          {currentFamily && (
            <Card>
              <h2 className="section-title">Configuracoes da familia</h2>
              <form onSubmit={updateFamily} className="mt-5 space-y-4">
                <div className="flex items-center gap-3">
                  <label className={`flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-rose-50 text-blush shadow-card ${!canAdmin ? "pointer-events-none opacity-60" : ""}`}>
                    {familyForm.image_url ? <img src={familyForm.image_url} alt="" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}
                    <input type="file" accept="image/*" className="hidden" onChange={handleFamilyImage} disabled={!canAdmin} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">Imagem da familia</p>
                    <p className="text-xs text-muted">Upload com preview antes de salvar.</p>
                  </div>
                </div>
                <input className="soft-input" value={familyForm.name} onChange={(event) => setFamilyForm((current) => ({ ...current, name: event.target.value }))} disabled={!canAdmin} />
                <textarea className="soft-input min-h-28 resize-none" placeholder="Descricao" value={familyForm.description} onChange={(event) => setFamilyForm((current) => ({ ...current, description: event.target.value }))} disabled={!canAdmin} />
                <Button type="submit" className="w-full" disabled={!canAdmin}>
                  <ImagePlus className="h-5 w-5" />
                  Salvar configuracoes
                </Button>
                {canAdmin && (
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
              <p className="text-xs font-bold text-muted">pontos</p>
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
              {currentFamily && <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-blush">{stats.active} tarefas ativas</span>}
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
                        <span className="text-sm font-bold">{member.points} pts</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">#{index + 1} ranking</p>
                    </div>
                  </div>
                  {canAdmin && member.role !== "owner" && member.user_id !== user?.id && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <SelectMenu
                        value={member.role === "admin" ? "admin" : "member"}
                        onChange={(role) => updateMemberRole(member, role)}
                        options={[
                          { value: "admin", label: "Admin", helper: "Pode gerenciar" },
                          { value: "member", label: "Membro", helper: "Uso normal" }
                        ]}
                      />
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
    </>
  );
}

import { useEffect, useState } from "react";
import { CalendarHeart, Heart, MessageCircleHeart, Plus, Sparkles, Target } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { coupleApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { formatDate, normalizeApiError } from "../utils/formatters";

export default function CoupleSpace() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [space, setSpace] = useState({ goals: [], date_ideas: [], notes: [] });
  const [goalTitle, setGoalTitle] = useState("");
  const [dateTitle, setDateTitle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setSpace(await coupleApi.get());
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createGoal(event) {
    event.preventDefault();
    try {
      await coupleApi.createGoal({ title: goalTitle, target_date: null });
      addNotification({
        title: "Nova meta do casal",
        description: `${goalTitle} entrou no cantinho de metas.`,
        type: "couple",
        actor: user?.name
      });
      setGoalTitle("");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function createDateIdea(event) {
    event.preventDefault();
    try {
      await coupleApi.createDateIdea({ title: dateTitle, mood: "romântico" });
      addNotification({
        title: "Nova ideia de date",
        description: `${dateTitle} foi adicionada para um momento especial.`,
        type: "couple",
        actor: user?.name
      });
      setDateTitle("");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function createNote(event) {
    event.preventDefault();
    try {
      await coupleApi.createNote({ message: note });
      addNotification({
        title: "Nova nota rápida",
        description: "Uma mensagem carinhosa foi guardada no Espaço do Casal.",
        type: "couple",
        actor: user?.name
      });
      setNote("");
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Espaço do Casal" subtitle="Metas, ideias de dates, relacionamento e mensagens rápidas." user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-rose-50/70">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-blush">
              <Heart className="h-6 w-6" />
            </div>
            <div>
              <h2 className="section-title">Nosso cantinho especial</h2>
              <p className="text-sm text-muted">Pequenas ações que mantêm a conexão visível.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <form onSubmit={createGoal} className="rounded-[24px] bg-white/80 p-4">
              <Target className="h-5 w-5 text-blush" />
              <p className="mt-3 font-bold text-ink">Meta</p>
              <input className="soft-input mt-3" placeholder="Nova meta" value={goalTitle} onChange={(event) => setGoalTitle(event.target.value)} required />
              <Button type="submit" className="mt-3 w-full py-2">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </form>
            <form onSubmit={createDateIdea} className="rounded-[24px] bg-white/80 p-4">
              <CalendarHeart className="h-5 w-5 text-orange-500" />
              <p className="mt-3 font-bold text-ink">Date</p>
              <input className="soft-input mt-3" placeholder="Ideia de date" value={dateTitle} onChange={(event) => setDateTitle(event.target.value)} required />
              <Button type="submit" className="mt-3 w-full py-2">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </form>
            <form onSubmit={createNote} className="rounded-[24px] bg-white/80 p-4">
              <MessageCircleHeart className="h-5 w-5 text-lavender" />
              <p className="mt-3 font-bold text-ink">Nota</p>
              <input className="soft-input mt-3" placeholder="Mensagem rápida" value={note} onChange={(event) => setNote(event.target.value)} required />
              <Button type="submit" className="mt-3 w-full py-2">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </form>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-rose-50 via-white to-violet-50">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-blush shadow-card">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Metas do casal</h2>
                <p className="text-sm text-muted">Planos pequenos, sonhos grandes.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {space.goals.map((goal) => (
                <div key={goal.id} className="rounded-[22px] border border-white/80 bg-white/80 px-4 py-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink">{goal.title}</p>
                      {goal.description && <p className="mt-2 text-sm leading-relaxed text-muted">{goal.description}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-blush">{goal.status || "ativa"}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-muted">
                    <CalendarHeart className="h-4 w-4 text-orange-400" />
                    {formatDate(goal.target_date, "Sem data definida")}
                  </div>
                </div>
              ))}
              {!space.goals.length && <p className="rounded-2xl bg-white/70 px-4 py-4 text-sm font-semibold text-muted">Nenhuma meta por enquanto.</p>}
            </div>
          </Card>

          <Card>
            <h2 className="section-title">Ideias de dates</h2>
            <div className="mt-4 space-y-3">
              {space.date_ideas.map((idea) => (
                <div key={idea.id} className="rounded-2xl bg-white/75 px-4 py-3">
                  <p className="font-semibold text-ink">{idea.title}</p>
                  <p className="mt-1 text-sm text-muted">{idea.mood}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="section-title">Notas rápidas</h2>
            <div className="mt-4 space-y-3">
              {space.notes.map((item) => (
                <p key={item.id} className="rounded-2xl bg-white/75 px-4 py-3 text-sm text-ink">
                  {item.message}
                </p>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}


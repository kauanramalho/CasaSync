import { useEffect, useState } from "react";
import { CalendarHeart, Heart, MessageCircleHeart, Plus, Target } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { coupleApi } from "../services/api";
import { formatDate, normalizeApiError } from "../utils/formatters";

export default function CoupleSpace() {
  const { user } = useAuth();
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
      setGoalTitle("");
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function createDateIdea(event) {
    event.preventDefault();
    try {
      await coupleApi.createDateIdea({ title: dateTitle, mood: "romântico" });
      setDateTitle("");
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function createNote(event) {
    event.preventDefault();
    try {
      await coupleApi.createNote({ message: note });
      setNote("");
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
          <Card>
            <h2 className="section-title">Metas do casal</h2>
            <div className="mt-4 space-y-3">
              {space.goals.map((goal) => (
                <div key={goal.id} className="rounded-2xl bg-white/75 px-4 py-3">
                  <p className="font-semibold text-ink">{goal.title}</p>
                  <p className="mt-1 text-sm text-muted">{formatDate(goal.target_date, "Sem data definida")}</p>
                </div>
              ))}
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

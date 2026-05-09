import { useEffect, useState } from "react";
import { Medal, Star, Trophy } from "lucide-react";

import Avatar from "../components/Avatar";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { dashboardApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";

export default function Ranking() {
  const { user } = useAuth();
  const [ranking, setRanking] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    dashboardApi
      .get()
      .then((data) => setRanking(data.ranking))
      .catch((err) => setError(normalizeApiError(err)));
  }, []);

  const maxPoints = Math.max(...ranking.map((item) => item.points), 1);
  const totalPoints = ranking.reduce((sum, item) => sum + item.points, 0);
  const levels = [
    { name: "Base organizada", range: "0 a 150 pontos", min: 0, max: 150 },
    { name: "Rotina sincronizada", range: "151 a 500 pontos", min: 151, max: 500 },
    { name: "Casa em harmonia", range: "500+ pontos", min: 501, max: Infinity }
  ];

  return (
    <>
      <PageHeader title="Ranking" subtitle="Pontuação por tarefas concluídas: baixa 5, média 10 e alta 20 pontos." user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="section-title">Ranking geral</h2>
          <div className="mt-6 space-y-4">
            {ranking.map((item) => (
              <div key={item.user.id} className="grid gap-4 rounded-[24px] bg-white/75 p-4 md:grid-cols-[56px_1fr_auto] md:items-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-500">
                  {item.position === 1 ? <Trophy className="h-6 w-6" /> : <Medal className="h-6 w-6" />}
                </div>
                <div className="flex items-center gap-4">
                  <Avatar user={item.user} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">{item.user.name}</p>
                    <p className="text-sm text-muted">{item.completed_tasks} tarefas concluídas</p>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-blue-400 via-violet-400 to-blush" style={{ width: `${(item.points / maxPoints) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <p className="text-xl font-bold text-ink">{item.points} pts</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-violet-50 text-lavender">
            <Star className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-ink">Níveis do casal</h2>
          <div className="mt-6 space-y-4">
            {levels.map((level) => {
              const active = totalPoints >= level.min && totalPoints <= level.max;
              return (
                <div
                  key={level.name}
                  className={`rounded-2xl border p-4 transition ${
                    active ? "border-blush/45 bg-gradient-to-r from-blush/20 to-peach/14 shadow-card" : "border-slate-100 bg-white/75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{level.name}</p>
                      <p className="mt-1 text-sm text-muted">{level.range}</p>
                    </div>
                    {active && <span className="rounded-full bg-blush/10 px-3 py-1 text-xs font-bold text-blush">Atual</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, Plus, Sparkles } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import SelectMenu from "../components/SelectMenu";
import { CategoryBadge, PriorityBadge } from "../components/Badges";
import { useAuth } from "../hooks/useAuth";
import { familiesApi, plannerApi } from "../services/api";
import { formatDate, normalizeApiError } from "../utils/formatters";

const quickPrompts = ["Crie uma rotina de estudos", "Organize minha semana", "Crie tarefas para casa", "Monte uma rotina de igreja"];

export default function AiPlanner() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("Organize minha semana");
  const [suggestions, setSuggestions] = useState([]);
  const [members, setMembers] = useState([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    familiesApi.members().then(setMembers).catch(() => setMembers([]));
  }, []);

  const memberOptions = useMemo(
    () => [{ value: "", label: "Responsavel: eu" }, ...members.map((member) => ({ value: member.user_id, label: member.user.name, helper: `${member.points} pts` }))],
    [members]
  );

  async function suggest(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await plannerApi.suggest(prompt);
      setSuggestions(response.suggestions);
      setMessage(response.message);
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function createTasks() {
    setError("");
    try {
      const response = await plannerApi.createTasks({ suggestions, assignee_id: assigneeId || undefined });
      setMessage(`${response.created_tasks.length} tarefas criadas.`);
      setSuggestions([]);
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Planejador IA" subtitle="Estrutura inicial com respostas simuladas e criacao real de tarefas." user={user} />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-lavender">
            <Bot className="h-7 w-7" />
          </div>
          <form onSubmit={suggest} className="mt-5 space-y-4">
            <textarea className="soft-input min-h-40 resize-none" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((item) => (
                <button key={item} type="button" onClick={() => setPrompt(item)} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-muted hover:text-blush">
                  {item}
                </button>
              ))}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <Sparkles className="h-5 w-5" />
              {loading ? "Planejando..." : "Gerar sugestoes"}
            </Button>
          </form>
        </Card>

        <Card>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="section-title">Sugestoes</h2>
              {message && <p className="mt-2 text-sm text-muted">{message}</p>}
            </div>
            <SelectMenu className="md:w-56" value={assigneeId} onChange={setAssigneeId} options={memberOptions} />
          </div>

          {error && <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

          <div className="mt-5 space-y-3">
            {suggestions.map((suggestion) => (
              <div key={`${suggestion.title}-${suggestion.category_name}`} className="rounded-[24px] bg-white/75 p-4 shadow-card transition hover:-translate-y-0.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold text-ink">{suggestion.title}</p>
                  <div className="flex gap-2">
                    <CategoryBadge category={suggestion.category_name} />
                    <PriorityBadge priority={suggestion.priority} />
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">{suggestion.description}</p>
                <p className="mt-3 text-xs font-semibold text-muted">Prazo: {formatDate(suggestion.due_date)}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={createTasks} disabled={!suggestions.length}>
              <Plus className="h-5 w-5" />
              Transformar em tarefas
            </Button>
          </div>

          {!suggestions.length && (
            <div className="mt-6 rounded-[24px] bg-white/75 p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-3 text-sm font-semibold text-muted">As proximas sugestoes aparecerao aqui.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

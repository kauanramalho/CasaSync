import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarHeart,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Heart,
  ImagePlus,
  Link2,
  MapPin,
  MessageCircleHeart,
  PiggyBank,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  UserRound
} from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import CategoryStylePicker, { getPaletteIdForColor } from "../components/CategoryStylePicker";
import DateTimePicker from "../components/DateTimePicker";
import PageHeader from "../components/PageHeader";
import { categoryIconMap } from "../components/Badges";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { coupleApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { readFileAsDataUrl, validateImageFile } from "../utils/files";
import { formatDate, normalizeApiError, toIsoOrNull } from "../utils/formatters";
import { getStoredPreferences } from "../utils/preferences";
import { findColor } from "../utils/categoryDesign";
import { getCategoryTone } from "../utils/tasks";

const initialGoal = { title: "", description: "", target_date: "", progress: 0 };
const initialDate = { title: "", description: "", location: "", budget: "", external_url: "", image_url: "", suggested_date: "", mood: "romantico" };
const initialNote = { message: "", color: "rose", icon: "heart" };

const noteIconStorageKey = "casasync_quick_note_icons";

function getStoredNoteIcons() {
  try {
    return JSON.parse(localStorage.getItem(noteIconStorageKey) || "{}");
  } catch {
    return {};
  }
}

function saveStoredNoteIcons(nextIcons) {
  localStorage.setItem(noteIconStorageKey, JSON.stringify(nextIcons));
}

function isDataImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function domainFromUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: getStoredPreferences().timezone
  }).format(new Date(value));
}

export default function CoupleSpace() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [space, setSpace] = useState({ goals: [], date_ideas: [], notes: [] });
  const [goalForm, setGoalForm] = useState(initialGoal);
  const [dateForm, setDateForm] = useState(initialDate);
  const [noteForm, setNoteForm] = useState(initialNote);
  const [dateImageError, setDateImageError] = useState("");
  const [noteIcons, setNoteIcons] = useState(getStoredNoteIcons);
  const [activeNotePalette, setActiveNotePalette] = useState("pastel");
  const [editingNote, setEditingNote] = useState(null);
  const [error, setError] = useState("");
  const dateImageInputRef = useRef(null);

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

  const notePreviewColor = useMemo(() => findColor(noteForm.color), [noteForm.color]);

  function persistNoteIcon(noteId, icon) {
    if (!noteId) return;
    setNoteIcons((current) => {
      const next = { ...current, [noteId]: icon || initialNote.icon };
      saveStoredNoteIcons(next);
      return next;
    });
  }

  function removeStoredNoteIcon(noteId) {
    setNoteIcons((current) => {
      const next = { ...current };
      delete next[noteId];
      saveStoredNoteIcons(next);
      return next;
    });
  }

  async function handleDateImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setDateImageError(validationError);
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDateImageError("");
      setDateForm((current) => ({ ...current, image_url: dataUrl }));
    } catch {
      setDateImageError("Nao foi possivel carregar a imagem.");
    }
  }

  function clearDateImage() {
    setDateImageError("");
    setDateForm((current) => ({ ...current, image_url: "" }));
    if (dateImageInputRef.current) dateImageInputRef.current.value = "";
  }

  async function createGoal(event) {
    event.preventDefault();
    try {
      await coupleApi.createGoal({
        ...goalForm,
        progress: Number(goalForm.progress) || 0,
        target_date: toIsoOrNull(goalForm.target_date)
      });
      addNotification({ title: "Nova meta do casal", description: `${goalForm.title} entrou no cantinho de metas.`, type: "couple", actor: user?.name });
      setGoalForm(initialGoal);
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function updateGoal(goal, payload) {
    try {
      await coupleApi.updateGoal(goal.id, payload);
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function removeGoal(goal) {
    await coupleApi.deleteGoal(goal.id);
    load();
  }

  async function createDateIdea(event) {
    event.preventDefault();
    try {
      await coupleApi.createDateIdea({ ...dateForm, suggested_date: toIsoOrNull(dateForm.suggested_date) });
      addNotification({ title: "Nova ideia de date", description: `${dateForm.title} foi adicionada para um momento especial.`, type: "couple", actor: user?.name });
      setDateForm(initialDate);
      clearDateImage();
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function toggleDateIdea(idea) {
    await coupleApi.updateDateIdea(idea.id, { is_done: !idea.is_done });
    load();
  }

  async function removeDateIdea(idea) {
    await coupleApi.deleteDateIdea(idea.id);
    load();
  }

  async function createNote(event) {
    event.preventDefault();
    try {
      const created = await coupleApi.createNote({ message: noteForm.message, color: noteForm.color });
      persistNoteIcon(created?.id, noteForm.icon);
      addNotification({ title: "Nova nota rapida", description: "Uma mensagem carinhosa foi guardada no Espaco do Casal.", type: "couple", actor: user?.name });
      setNoteForm(initialNote);
      setActiveNotePalette(getPaletteIdForColor(initialNote.color));
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  async function saveNote() {
    if (!editingNote) return;
    await coupleApi.updateNote(editingNote.id, { message: editingNote.message, color: editingNote.color });
    persistNoteIcon(editingNote.id, editingNote.icon);
    setEditingNote(null);
    load();
  }

  async function removeNote(note) {
    await coupleApi.deleteNote(note.id);
    removeStoredNoteIcon(note.id);
    load();
  }

  return (
    <>
      <PageHeader title="Espaco do Casal" subtitle="Metas, ideias de dates, relacionamento e mensagens rapidas." user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.2fr]">
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-rose-50 via-white to-violet-50">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-blush shadow-card">
                <Heart className="h-6 w-6" />
              </div>
              <div>
                <h2 className="section-title">Nosso cantinho especial</h2>
                <p className="text-sm text-muted">Pequenas acoes com cara de ritual.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/80 p-4 shadow-card">
                <p className="text-2xl font-bold text-blush">{space.goals.length}</p>
                <p className="text-xs font-bold text-muted">metas vivas</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-4 shadow-card">
                <p className="text-2xl font-bold text-orange-500">{space.date_ideas.length}</p>
                <p className="text-xs font-bold text-muted">dates salvos</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-4 shadow-card">
                <p className="text-2xl font-bold text-lavender">{space.notes.length}</p>
                <p className="text-xs font-bold text-muted">notas rapidas</p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="section-title">Criar meta</h2>
            <form onSubmit={createGoal} className="mt-5 space-y-3">
              <input className="soft-input" placeholder="Ex: viagem juntos" value={goalForm.title} onChange={(event) => setGoalForm((current) => ({ ...current, title: event.target.value }))} required />
              <textarea className="soft-input min-h-24 resize-none" placeholder="Descricao opcional" value={goalForm.description} onChange={(event) => setGoalForm((current) => ({ ...current, description: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <DateTimePicker value={goalForm.target_date} onChange={(value) => setGoalForm((current) => ({ ...current, target_date: value }))} placeholder="Data da meta" />
                <input className="soft-input" type="number" min="0" max="100" placeholder="Progresso %" value={goalForm.progress} onChange={(event) => setGoalForm((current) => ({ ...current, progress: event.target.value }))} />
              </div>
              <Button type="submit" className="w-full">
                <Plus className="h-5 w-5" />
                Adicionar meta
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="section-title">Nova ideia de date</h2>
            <form onSubmit={createDateIdea} className="mt-5 space-y-3">
              <input className="soft-input" placeholder="Titulo do date" value={dateForm.title} onChange={(event) => setDateForm((current) => ({ ...current, title: event.target.value }))} required />
              <textarea className="soft-input min-h-20 resize-none" placeholder="Descricao" value={dateForm.description} onChange={(event) => setDateForm((current) => ({ ...current, description: event.target.value }))} />
              <DateTimePicker value={dateForm.suggested_date} onChange={(value) => setDateForm((current) => ({ ...current, suggested_date: value }))} placeholder="Data sugerida do date" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="soft-input" placeholder="Local" value={dateForm.location} onChange={(event) => setDateForm((current) => ({ ...current, location: event.target.value }))} />
                <input className="soft-input" placeholder="Orcamento" value={dateForm.budget} onChange={(event) => setDateForm((current) => ({ ...current, budget: event.target.value }))} />
              </div>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input className="soft-input pl-10" placeholder="Link do local, Instagram ou Google Maps" value={dateForm.external_url} onChange={(event) => setDateForm((current) => ({ ...current, external_url: event.target.value }))} />
              </div>
              <div className="relative">
                <ImagePlus className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  className="soft-input pl-10"
                  placeholder={isDataImage(dateForm.image_url) ? "Imagem local selecionada" : "Imagem opcional (URL)"}
                  value={isDataImage(dateForm.image_url) ? "" : dateForm.image_url}
                  onChange={(event) => {
                    setDateImageError("");
                    setDateForm((current) => ({ ...current, image_url: event.target.value }));
                  }}
                />
              </div>
              <div className="rounded-[22px] border border-slate-100 bg-white/70 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-muted shadow-card transition hover:text-blush">
                    <ImagePlus className="h-4 w-4" />
                    Escolher imagem
                    <input ref={dateImageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleDateImageFile} />
                  </label>
                  {dateForm.image_url && (
                    <button type="button" onClick={clearDateImage} className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-600">
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </button>
                  )}
                  <span className="text-xs font-semibold text-muted">PNG, JPG ou WEBP ate 2 MB.</span>
                </div>
                {dateImageError && <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{dateImageError}</p>}
                {dateForm.image_url && (
                  <div className="mt-3 overflow-hidden rounded-[20px] border border-white/80 bg-slate-50">
                    <img src={dateForm.image_url} alt="Preview do date" className="h-40 w-full object-cover" />
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full">
                <Plus className="h-5 w-5" />
                Salvar date
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="section-title">Nota rapida</h2>
            <form onSubmit={createNote} className="mt-5 space-y-3">
              <textarea className="soft-input min-h-24 resize-none" placeholder="Escreva uma mensagem curta..." value={noteForm.message} onChange={(event) => setNoteForm((current) => ({ ...current, message: event.target.value }))} required />
              <CategoryStylePicker
                color={noteForm.color}
                icon={noteForm.icon}
                activePalette={activeNotePalette}
                onPaletteChange={setActiveNotePalette}
                onColorChange={(color) => setNoteForm((current) => ({ ...current, color }))}
                onIconChange={(icon) => setNoteForm((current) => ({ ...current, icon }))}
                previewTitle="Nota rapida"
                previewHelper={notePreviewColor?.label}
                showPreview
              />
              <Button type="submit" className="w-full">
                <MessageCircleHeart className="h-5 w-5" />
                Guardar nota
              </Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-white via-rose-50/60 to-violet-50">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-blush shadow-card">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Metas do casal</h2>
                <p className="text-sm text-muted">Planos pequenos, sonhos grandes.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {space.goals.map((goal) => (
                <div key={goal.id} className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink">{goal.title}</p>
                      {goal.description && <p className="mt-2 text-sm leading-relaxed text-muted">{goal.description}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-blush">{goal.status || "ativa"}</span>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-rose-100/80">
                    <div className="h-full rounded-full bg-gradient-to-r from-peach to-blush transition-all" style={{ width: `${Math.min(100, goal.progress || 0)}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-muted">
                    <span className="inline-flex items-center gap-1">
                      <CalendarHeart className="h-4 w-4 text-orange-400" />
                      {formatDate(goal.target_date, "Sem data definida")}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-4 w-4 text-lavender" />
                      {goal.created_by?.name || "CasaSync"}
                    </span>
                    <span>{goal.progress || 0}%</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[25, 50, 75, 100].map((value) => (
                      <button key={value} type="button" onClick={() => updateGoal(goal, { progress: value, status: value === 100 ? "concluida" : "ativa" })} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-muted shadow-card hover:bg-rose-50 hover:text-blush">
                        {value}%
                      </button>
                    ))}
                    <button type="button" onClick={() => updateGoal(goal, { progress: 100, status: "concluida" })} className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Concluir
                    </button>
                    <button type="button" onClick={() => removeGoal(goal)} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">
                      <Trash2 className="h-3 w-3" />
                      Remover
                    </button>
                  </div>
                </div>
              ))}
              {!space.goals.length && <p className="empty-state">Nenhuma meta por enquanto.</p>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-500 shadow-card">
                <CalendarHeart className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Ideias de dates</h2>
                <p className="text-sm text-muted">Com local, orcamento e link para abrir direto.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {space.date_ideas.map((idea) => (
                <div key={idea.id} className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-soft">
                  <div
                    className="h-28 bg-gradient-to-br from-rose-100 via-orange-50 to-violet-100"
                    style={idea.image_url ? { backgroundImage: `url(${idea.image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-ink">{idea.title}</p>
                        {idea.description && <p className="mt-1 text-sm text-muted">{idea.description}</p>}
                      </div>
                      <button type="button" onClick={() => toggleDateIdea(idea)} className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${idea.is_done ? "bg-emerald-400 text-white" : "bg-slate-50 text-muted hover:bg-emerald-50 hover:text-emerald-600"}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-4 space-y-2 text-xs font-bold text-muted">
                      {idea.location && (
                        <p className="inline-flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-blush" />
                          {idea.location}
                        </p>
                      )}
                      {idea.budget && (
                        <p className="inline-flex items-center gap-2">
                          <PiggyBank className="h-4 w-4 text-orange-500" />
                          {idea.budget}
                        </p>
                      )}
                      {idea.suggested_date && (
                        <p className="inline-flex items-center gap-2">
                          <CalendarHeart className="h-4 w-4 text-blue-500" />
                          {formatDate(idea.suggested_date)}
                        </p>
                      )}
                      <p className="inline-flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-lavender" />
                        {idea.mood}
                      </p>
                    </div>
                    {idea.external_url && (
                      <a href={idea.external_url} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-bold text-blush transition hover:bg-rose-100">
                        <span className="truncate">{domainFromUrl(idea.external_url)}</span>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button type="button" onClick={() => removeDateIdea(idea)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-700">
                      <Trash2 className="h-3 w-3" />
                      Remover date
                    </button>
                  </div>
                </div>
              ))}
              {!space.date_ideas.length && <p className="empty-state md:col-span-2">Nenhuma ideia salva ainda.</p>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-lavender shadow-card">
                <MessageCircleHeart className="h-5 w-5" />
              </div>
              <div>
                <h2 className="section-title">Notas rapidas</h2>
                <p className="text-sm text-muted">Sticky notes suaves, editaveis e com autoria.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {space.notes.map((note) => {
                const editing = editingNote?.id === note.id;
                const icon = editing ? editingNote.icon : noteIcons[note.id] || initialNote.icon;
                const NoteIcon = categoryIconMap[icon] || MessageCircleHeart;
                const color = findColor(editing ? editingNote.color : note.color);
                return (
                  <div key={note.id} className={`rotate-[-0.5deg] rounded-[22px] border p-4 shadow-card transition hover:rotate-0 hover:-translate-y-0.5 ${getCategoryTone({ color: editing ? editingNote.color : note.color })}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/80 shadow-card" style={{ color: color?.hex }}>
                        <NoteIcon className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide opacity-75">{color?.label || "Nota"}</span>
                    </div>
                    {editing ? (
                      <div className="space-y-4">
                        <textarea className="soft-input min-h-28 resize-none bg-white/80" value={editingNote.message} onChange={(event) => setEditingNote((current) => ({ ...current, message: event.target.value }))} />
                        <CategoryStylePicker
                          color={editingNote.color}
                          icon={editingNote.icon}
                          activePalette={activeNotePalette}
                          onPaletteChange={setActiveNotePalette}
                          onColorChange={(nextColor) => setEditingNote((current) => ({ ...current, color: nextColor }))}
                          onIconChange={(nextIcon) => setEditingNote((current) => ({ ...current, icon: nextIcon }))}
                        />
                      </div>
                    ) : (
                      <p className="text-sm font-semibold leading-relaxed">{note.message}</p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold opacity-75">
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" />
                        {note.created_by?.name || "CasaSync"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        {formatDate(note.created_at)} as {formatTime(note.created_at)}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {editing ? (
                        <button type="button" onClick={saveNote} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-600 shadow-card">
                          <Save className="h-3 w-3" />
                          Salvar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNote({ ...note, icon });
                            setActiveNotePalette(getPaletteIdForColor(note.color));
                          }}
                          className="rounded-full bg-white px-3 py-1 text-xs font-bold text-muted shadow-card hover:text-blush"
                        >
                          Editar
                        </button>
                      )}
                      <button type="button" onClick={() => removeNote(note)} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-600 shadow-card">
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
              {!space.notes.length && <p className="empty-state md:col-span-2">Nenhuma nota ainda.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

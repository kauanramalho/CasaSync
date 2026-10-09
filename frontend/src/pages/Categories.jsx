import { useEffect, useRef, useState } from "react";
import { FolderPlus, Plus, Save, X } from "lucide-react";

import { categoryIconMap } from "../components/Badges";
import Button from "../components/Button";
import Card from "../components/Card";
import CategoryStylePicker from "../components/CategoryStylePicker";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import useDialogFocus from "../hooks/useDialogFocus";
import { categoriesApi } from "../services/api";
import { emitAppDataChanged } from "../utils/events";
import { colorPalettes, findColor } from "../utils/categoryDesign";
import { normalizeApiError } from "../utils/formatters";
import { getCategoryTone } from "../utils/tasks";

const initialForm = { name: "", color: "rose", icon: "sparkles" };

export default function Categories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [activePalette, setActivePalette] = useState("pastel");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, editorOpen, () => { if (!savingRef.current) resetForm(); });

  async function load() {
    try {
      setCategories(await categoriesApi.list());
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  const SelectedIcon = categoryIconMap[form.icon] ?? FolderPlus;
  const selectedColor = findColor(form.color);
  function startEdit(category) {
    setError("");
    setMessage("");
    setEditing(category);
    setForm({ name: category.name, color: category.color || "rose", icon: category.icon || "sparkles" });
    const ownerPalette = colorPalettes.find((item) => item.colors.some((color) => color.key === category.color));
    setActivePalette(ownerPalette?.id || "pastel");
    setEditorOpen(true);
  }

  function resetForm() {
    if (savingRef.current) return;
    setEditing(null);
    setForm(initialForm);
    setActivePalette("pastel");
    setEditorOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editing) {
        await categoriesApi.update(editing.id, form);
        setMessage("Categoria atualizada com estilo novo.");
      } else {
        await categoriesApi.create(form);
        setMessage("Categoria criada com sucesso.");
      }
      setEditing(null);
      setForm(initialForm);
      setEditorOpen(false);
      emitAppDataChanged();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Categorias" subtitle="Organize tarefas por áreas da vida da família." user={user} />
      {(error || message) && (
        <p className={`mb-5 rounded-2xl px-4 py-3 text-sm font-semibold ${error ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
          {error || message}
        </p>
      )}

      <div className="mx-auto max-w-5xl">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="section-title">Biblioteca de categorias</h2>
              <p className="mt-1 text-xs text-muted">Toque numa categoria para editar.</p>
            </div>
            <Button type="button" variant="secondary" className="min-h-11 px-3 py-2 text-sm" onClick={() => { resetForm(); setError(""); setMessage(""); setEditorOpen(true); }}>
              <Plus className="h-4 w-4" /> Adicionar categoria
            </Button>
          </div>
          <p className="mb-3 text-xs text-muted">{categories.length} categorias</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
            {categories.map((category) => {
              const Icon = categoryIconMap[category.icon] ?? FolderPlus;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => startEdit(category)}
                  aria-label={`Editar categoria ${category.name}`}
                  className={`group flex min-w-0 flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 sm:p-4 ${getCategoryTone(category)}`}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/80 sm:h-12 sm:w-12">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </div>
                  <span className="line-clamp-2 w-full break-words text-xs font-bold leading-snug sm:text-sm">{category.name}</span>
                </button>
              );
            })}
          </div>
          {!categories.length && <p className="empty-state">Nenhuma categoria ainda. Adicione a primeira.</p>}
        </Card>
      </div>
      {editorOpen && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-900/30 p-2 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) resetForm(); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="category-editor-title" tabIndex={-1} className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-soft sm:max-h-[92dvh]">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="category-editor-title" className="section-title">{editing ? "Editar categoria" : "Adicionar categoria"}</h2>
                  {editing && <p className="mt-1 text-xs text-muted">{editing.is_default ? "Categoria padrão" : "Categoria personalizada"}</p>}
                </div>
                <button type="button" onClick={resetForm} disabled={saving} aria-label="Fechar categoria" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-muted"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <form id="category-editor-form" onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              <div className={`rounded-2xl border p-3 ${getCategoryTone(form)}`}>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 shadow-card">
                    <SelectedIcon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-bold">{form.name || "Nome da categoria"}</p>
                    <p className="text-sm opacity-80">{selectedColor?.label || "Cor personalizada"}</p>
                  </div>
                </div>
              </div>

              <label htmlFor="category-name" className="block text-sm font-semibold text-ink">Nome</label>
              <input id="category-name" className="soft-input" placeholder="Nome da categoria" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={80} disabled={saving} required />

              <fieldset disabled={saving} className="min-w-0">
                <CategoryStylePicker
                  color={form.color}
                  icon={form.icon}
                  activePalette={activePalette}
                  onPaletteChange={setActivePalette}
                  onColorChange={(color) => setForm((current) => ({ ...current, color }))}
                  onIconChange={(icon) => setForm((current) => ({ ...current, icon }))}
                />
              </fieldset>
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}
            </form>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>Cancelar</Button>
              <Button type="submit" form="category-editor-form" disabled={saving}>
                {editing ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {saving ? "Salvando..." : editing ? "Salvar categoria" : "Criar categoria"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

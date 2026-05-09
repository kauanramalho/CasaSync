import { useEffect, useState } from "react";
import { FolderPlus, Plus, Save } from "lucide-react";

import { categoryIconMap } from "../components/Badges";
import Button from "../components/Button";
import Card from "../components/Card";
import CategoryStylePicker from "../components/CategoryStylePicker";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { categoriesApi } from "../services/api";
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
    setEditing(category);
    setForm({ name: category.name, color: category.color || "rose", icon: category.icon || "sparkles" });
    const ownerPalette = colorPalettes.find((item) => item.colors.some((color) => color.key === category.color));
    if (ownerPalette) setActivePalette(ownerPalette.id);
  }

  function resetForm() {
    setEditing(null);
    setForm(initialForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
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
      resetForm();
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Categorias" subtitle="Organize tarefas por areas da vida da familia." user={user} />
      {(error || message) && (
        <p className={`mb-5 rounded-2xl px-4 py-3 text-sm font-semibold ${error ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
          {error || message}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">Biblioteca de categorias</h2>
              <p className="mt-1 text-sm text-muted">Clique em qualquer card para trocar cor e icone.</p>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-blush">{categories.length} ativas</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => {
              const Icon = categoryIconMap[category.icon] ?? FolderPlus;
              const color = findColor(category.color);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => startEdit(category)}
                  className={`group rounded-[24px] border p-5 text-left shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-soft ${getCategoryTone(category)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 shadow-card">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="h-5 w-5 rounded-full ring-4 ring-white" style={{ backgroundColor: color?.hex || "#f85d8f" }} />
                  </div>
                  <p className="mt-4 font-bold">{category.name}</p>
                  <p className="mt-1 text-sm opacity-80">{category.is_default ? "Categoria padrao" : "Categoria personalizada"}</p>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wide opacity-0 transition group-hover:opacity-80">Editar visual</p>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="xl:sticky xl:top-8 xl:self-start">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">{editing ? "Editar categoria" : "Adicionar categoria"}</h2>
              <p className="mt-1 text-sm text-muted">Preview em tempo real antes de salvar.</p>
            </div>
            {editing && (
              <button type="button" onClick={resetForm} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-muted hover:bg-rose-50 hover:text-blush">
                Nova
              </button>
            )}
          </div>

          <div className={`mt-5 rounded-[24px] border p-4 ${getCategoryTone(form)}`}>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 shadow-card">
                <SelectedIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold">{form.name || "Nome da categoria"}</p>
                <p className="text-sm opacity-80">{selectedColor?.label || "Cor personalizada"}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            <input className="soft-input" placeholder="Nome" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />

            <CategoryStylePicker
              color={form.color}
              icon={form.icon}
              activePalette={activePalette}
              onPaletteChange={setActivePalette}
              onColorChange={(color) => setForm((current) => ({ ...current, color }))}
              onIconChange={(icon) => setForm((current) => ({ ...current, icon }))}
            />

            <Button type="submit" className="w-full">
              {editing ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editing ? "Salvar categoria" : "Criar categoria"}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

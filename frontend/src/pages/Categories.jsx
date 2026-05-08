import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Briefcase,
  CalendarHeart,
  Car,
  ClipboardCheck,
  Code2,
  Coffee,
  Dumbbell,
  Film,
  FolderPlus,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Leaf,
  Music,
  PawPrint,
  Plane,
  Plus,
  Save,
  Shirt,
  ShoppingCart,
  Smile,
  Sparkles,
  Utensils,
  Wallet
} from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { categoriesApi } from "../services/api";
import { colorPalettes, findColor, iconOptions } from "../utils/categoryDesign";
import { normalizeApiError } from "../utils/formatters";
import { getCategoryTone } from "../utils/tasks";

const iconMap = {
  sparkles: Sparkles,
  "book-open": BookOpen,
  briefcase: Briefcase,
  dumbbell: Dumbbell,
  "code-2": Code2,
  "heart-pulse": HeartPulse,
  wallet: Wallet,
  "shopping-cart": ShoppingCart,
  "shopping-bag": ShoppingCart,
  home: Home,
  smile: Smile,
  plane: Plane,
  heart: Heart,
  landmark: Landmark,
  music: Music,
  "gamepad-2": Gamepad2,
  film: Film,
  "paw-print": PawPrint,
  utensils: Utensils,
  "graduation-cap": GraduationCap,
  car: Car,
  coffee: Coffee,
  "calendar-heart": CalendarHeart,
  gift: Gift,
  laptop: Laptop,
  leaf: Leaf,
  shirt: Shirt,
  "clipboard-check": ClipboardCheck,
  phone: HeartPulse,
  book: BookOpen
};

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

  const SelectedIcon = iconMap[form.icon] ?? FolderPlus;
  const selectedColor = findColor(form.color);
  const palette = useMemo(() => colorPalettes.find((item) => item.id === activePalette) || colorPalettes[0], [activePalette]);

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
              const Icon = iconMap[category.icon] ?? FolderPlus;
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

            <div>
              <p className="mb-3 text-sm font-bold text-ink">Paleta</p>
              <div className="flex flex-wrap gap-2">
                {colorPalettes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActivePalette(item.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${activePalette === item.id ? "bg-rose-50 text-blush shadow-card" : "bg-white text-muted hover:bg-slate-50"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {palette.colors.map((color) => (
                  <button
                    key={color.key}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, color: color.key }))}
                    className={`group grid aspect-square place-items-center rounded-2xl border bg-white transition hover:-translate-y-0.5 ${form.color === color.key ? "border-rose-300 shadow-card ring-4 ring-rose-100" : "border-slate-100"}`}
                    title={color.label}
                  >
                    <span className="h-7 w-7 rounded-full shadow-inner transition group-hover:scale-110" style={{ backgroundColor: color.hex }} />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-bold text-ink">Icone</p>
              <div className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto pr-1">
                {iconOptions.map((option) => {
                  const Icon = iconMap[option.key] ?? Sparkles;
                  const active = form.icon === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      title={option.label}
                      onClick={() => setForm((current) => ({ ...current, icon: option.key }))}
                      className={`grid aspect-square place-items-center rounded-2xl border transition hover:-translate-y-0.5 ${active ? "border-rose-300 bg-rose-50 text-blush shadow-card" : "border-slate-100 bg-white text-muted hover:bg-slate-50 hover:text-ink"}`}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>

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

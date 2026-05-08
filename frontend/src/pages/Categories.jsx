import { useEffect, useState } from "react";
import { BookOpen, Briefcase, FolderPlus, Heart, Home, Music, Plus, ShoppingBag, Wallet } from "lucide-react";

import Button from "../components/Button";
import Card from "../components/Card";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { categoriesApi } from "../services/api";
import { normalizeApiError } from "../utils/formatters";

const iconMap = {
  heart: Heart,
  home: Home,
  "book-open": BookOpen,
  "graduation-cap": BookOpen,
  music: Music,
  briefcase: Briefcase,
  phone: Heart,
  "shopping-bag": ShoppingBag,
  wallet: Wallet,
  book: BookOpen,
  sparkles: FolderPlus
};

const colorMap = {
  rose: "bg-rose-50 text-rose-500",
  blue: "bg-blue-50 text-blue-500",
  emerald: "bg-emerald-50 text-emerald-500",
  violet: "bg-violet-50 text-violet-500",
  purple: "bg-purple-50 text-purple-500",
  slate: "bg-slate-100 text-slate-500",
  green: "bg-green-50 text-green-500",
  amber: "bg-amber-50 text-amber-500",
  cyan: "bg-cyan-50 text-cyan-500",
  pink: "bg-pink-50 text-pink-500"
};

export default function Categories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "", color: "rose", icon: "sparkles" });
  const [error, setError] = useState("");

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

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    try {
      await categoriesApi.create(form);
      setForm({ name: "", color: "rose", icon: "sparkles" });
      load();
    } catch (err) {
      setError(normalizeApiError(err));
    }
  }

  return (
    <>
      <PageHeader title="Categorias" subtitle="Organize tarefas por áreas da vida da família." user={user} />
      {error && <p className="mb-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => {
              const Icon = iconMap[category.icon] ?? FolderPlus;
              return (
                <div key={category.id} className="rounded-[24px] bg-white/75 p-5">
                  <div className={`grid h-12 w-12 place-items-center rounded-2xl ${colorMap[category.color] || colorMap.rose}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 font-bold text-ink">{category.name}</p>
                  <p className="mt-1 text-sm text-muted">{category.is_default ? "Categoria padrão" : "Categoria personalizada"}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="section-title">Adicionar categoria</h2>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <input className="soft-input" placeholder="Nome" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            <select className="soft-input" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}>
              <option value="rose">Rosa</option>
              <option value="blue">Azul</option>
              <option value="emerald">Verde</option>
              <option value="violet">Lilás</option>
              <option value="amber">Laranja</option>
            </select>
            <Button type="submit" className="w-full">
              <Plus className="h-5 w-5" />
              Salvar categoria
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}


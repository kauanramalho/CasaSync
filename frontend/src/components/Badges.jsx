import clsx from "clsx";
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
  Shirt,
  ShoppingCart,
  Smile,
  Sparkles,
  Utensils,
  Wallet
} from "lucide-react";

import { priorityLabels, statusLabels } from "../utils/formatters";
import { getCategoryHex, getCategoryIconKey, getCategoryMeta, getCategoryName, getCategoryTone } from "../utils/tasks";

const categoryClasses = {
  Relacionamento: "bg-rose-50 text-rose-600",
  Casa: "bg-blue-50 text-blue-600",
  Faculdade: "bg-emerald-50 text-emerald-600",
  Estudos: "bg-violet-50 text-violet-600",
  Igreja: "bg-purple-50 text-purple-600",
  Trabalho: "bg-slate-100 text-slate-600",
  Saúde: "bg-green-50 text-green-600",
  Compras: "bg-amber-50 text-amber-600",
  Finanças: "bg-cyan-50 text-cyan-600",
  Pessoal: "bg-pink-50 text-pink-600"
};

export const categoryIconMap = {
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

const priorityClasses = {
  baixa: "bg-emerald-50 text-emerald-600",
  media: "bg-orange-50 text-orange-600",
  alta: "bg-rose-50 text-rose-600"
};

const statusClasses = {
  pendente: "bg-orange-50 text-orange-600",
  em_andamento: "bg-blue-50 text-blue-600",
  concluida: "bg-emerald-50 text-emerald-600",
  atrasada: "bg-rose-50 text-rose-600"
};

function Pill({ children, className, style }) {
  return (
    <span className={clsx("inline-flex min-w-0 items-center rounded-full border border-transparent px-3 py-1 text-xs font-semibold", className)} style={style}>
      {children}
    </span>
  );
}

export function CategoryGlyph({ category, className, iconClassName }) {
  const Icon = categoryIconMap[getCategoryIconKey(category)] ?? FolderPlus;
  const hex = getCategoryHex(category);

  return (
    <span
      className={clsx("grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/75 shadow-sm", className)}
      style={{ color: hex }}
      aria-hidden="true"
    >
      <Icon className={clsx("h-3.5 w-3.5", iconClassName)} />
    </span>
  );
}

export function CategoryOptionContent({ option, active = false }) {
  const category = option?.category || option;
  const label = option?.label || getCategoryName(category);
  const helper = option?.helper || option?.description || category?.description;
  const hasVisual = Boolean(option?.category || category?.color || category?.icon);
  const hex = hasVisual ? getCategoryHex(category) : "#94a3b8";

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="relative shrink-0">
        <CategoryGlyph category={hasVisual ? category : null} className={clsx("h-9 w-9 rounded-2xl", active && "ring-4 ring-white")} iconClassName="h-4 w-4" />
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white" style={{ backgroundColor: hex }} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{label}</span>
        {helper && <span className="mt-0.5 block truncate text-xs font-medium text-muted">{helper}</span>}
      </span>
    </span>
  );
}

export function CategoryBadge({ category, className, showIcon = true, compact = false }) {
  const meta = getCategoryMeta(category);
  return (
    <Pill
      className={clsx("gap-1.5", getCategoryTone(category) || categoryClasses[meta.name] || "bg-slate-100 text-slate-600", className)}
      style={{ borderColor: `${meta.hex}26` }}
    >
      {showIcon && <CategoryGlyph category={category} className={compact ? "h-5 w-5" : "h-6 w-6"} iconClassName={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />}
      <span className="truncate">{meta.name}</span>
    </Pill>
  );
}

export function PriorityBadge({ priority }) {
  return <Pill className={priorityClasses[priority] || priorityClasses.media}>{priorityLabels[priority] || "Média"}</Pill>;
}

export function StatusBadge({ status }) {
  return <Pill className={statusClasses[status] || statusClasses.pendente}>{statusLabels[status] || "Pendente"}</Pill>;
}

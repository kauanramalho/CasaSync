import clsx from "clsx";

const variants = {
  primary: "bg-gradient-to-r from-peach to-blush text-white shadow-lg shadow-rose-200/70 hover:brightness-105",
  secondary: "bg-white text-ink border border-slate-200 hover:border-rose-200 hover:bg-rose-50/50",
  ghost: "bg-transparent text-muted hover:bg-white/70",
  danger: "bg-rose-50 text-rose-600 hover:bg-rose-100"
};

export default function Button({ as: Component = "button", children, className, variant = "primary", type = "button", ...props }) {
  const typeProps = Component === "button" ? { type } : {};

  return (
    <Component
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      {...typeProps}
      {...props}
    >
      {children}
    </Component>
  );
}

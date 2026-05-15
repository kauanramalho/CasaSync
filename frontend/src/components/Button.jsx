import clsx from "clsx";

const variants = {
  primary: "bg-gradient-to-r from-peach to-blush text-white shadow-lg shadow-blush/20 hover:brightness-105",
  secondary: "border border-slate-200 bg-white/85 text-ink hover:border-blush/35 hover:bg-blush/5",
  ghost: "bg-transparent text-muted hover:bg-white/70 hover:text-ink",
  danger: "bg-rose-50 text-rose-600 hover:bg-rose-100"
};

export default function Button({ as: Component = "button", children, className, variant = "primary", type = "button", ...props }) {
  const typeProps = Component === "button" ? { type } : {};

  return (
    <Component
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60",
        "min-w-0 max-w-full text-center",
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

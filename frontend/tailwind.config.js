/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        blush: "rgb(var(--color-blush) / <alpha-value>)",
        peach: "rgb(var(--color-peach) / <alpha-value>)",
        lavender: "rgb(var(--color-lavender) / <alpha-value>)",
        cream: "rgb(var(--color-cream) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-soft": "rgb(var(--color-surface-soft) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)"
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

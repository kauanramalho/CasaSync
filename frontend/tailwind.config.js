/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12213b",
        muted: "#687895",
        blush: "#f85d8f",
        peach: "#ff9b73",
        lavender: "#9d7cf4",
        cream: "#fff8f3"
      },
      boxShadow: {
        soft: "0 24px 70px rgba(81, 99, 137, 0.14)",
        card: "0 18px 45px rgba(111, 121, 145, 0.12)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};


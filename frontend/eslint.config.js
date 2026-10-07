import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

const browserGlobals = {
  AbortController: "readonly",
  Blob: "readonly",
  CustomEvent: "readonly",
  DOMParser: "readonly",
  Element: "readonly",
  File: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  document: "readonly",
  Event: "readonly",
  fetch: "readonly",
  FileReader: "readonly",
  FormData: "readonly",
  Image: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  Notification: "readonly",
  sessionStorage: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  window: "readonly"
};

export default [
  {
    ignores: ["dist", "node_modules"]
  },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: browserGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      sourceType: "module"
    },
    plugins: {
      react,
      "react-hooks": reactHooks
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react/jsx-uses-vars": "warn",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off"
    },
    settings: {
      react: { version: "detect" }
    }
  },
  {
    files: ["api/**/*.js", "vite.config.js"],
    languageOptions: { globals: { process: "readonly", Buffer: "readonly" } }
  },
  {
    files: ["public/sw.js"],
    languageOptions: { globals: { self: "readonly", caches: "readonly" } }
  }
];

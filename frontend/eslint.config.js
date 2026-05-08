import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

const browserGlobals = {
  clearTimeout: "readonly",
  console: "readonly",
  document: "readonly",
  Event: "readonly",
  fetch: "readonly",
  FileReader: "readonly",
  FormData: "readonly",
  Image: "readonly",
  localStorage: "readonly",
  setTimeout: "readonly",
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
  }
];

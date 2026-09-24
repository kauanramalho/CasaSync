import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveApiUrl } from "./src/services/apiConfig.js";

export default defineConfig(({ command, mode }) => {
  const envDir = fileURLToPath(new URL("..", import.meta.url));
  if (command === "build") {
    resolveApiUrl({ ...loadEnv(mode, envDir, ["VITE_", "NEXT_PUBLIC_"]), PROD: true, DEV: false });
  }
  return {
    envDir,
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173
    }
  };
});

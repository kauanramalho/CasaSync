function isLocalApiHost(hostname) {
  const host = hostname.toLowerCase();
  return ["localhost", "0.0.0.0", "::1", "[::1]"].includes(host) || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function appendApiPrefix(pathname) {
  const path = pathname.replace(/\/+$/, "");
  return path.endsWith("/api") ? path : `${path}/api`;
}

export function normalizeApiUrl(apiUrl, { isProduction = true } = {}) {
  const value = String(apiUrl || "").trim().replace(/\/+$/, "");
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (isProduction) {
      throw new Error("Configure VITE_API_URL com a URL publica completa do backend em producao.");
    }
    return appendApiPrefix(value);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("VITE_API_URL invalida. Use uma URL absoluta, por exemplo https://seu-backend.onrender.com/api.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error("VITE_API_URL deve usar HTTP/HTTPS e nao pode conter credenciais.");
  }
  if (isProduction) {
    if (parsedUrl.protocol !== "https:") {
      throw new Error("Em producao, VITE_API_URL deve usar HTTPS e apontar para o backend publico.");
    }
    if (isLocalApiHost(parsedUrl.hostname)) {
      throw new Error("VITE_API_URL de producao nao pode apontar para uma maquina local.");
    }
  }
  parsedUrl.pathname = appendApiPrefix(parsedUrl.pathname.replace(/\/{2,}/g, "/"));
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.toString().replace(/\/+$/, "");
}

export function resolveApiUrl(env = {}, { developmentFallbackUrl = "" } = {}) {
  const isDevelopment = env.DEV === true && env.PROD !== true;
  const value = (env.VITE_API_URL || env.NEXT_PUBLIC_API_URL || "").trim();
  if (!value && (!isDevelopment || !developmentFallbackUrl)) {
    throw new Error("API nao configurada. Defina VITE_API_URL com a URL publica do backend.");
  }
  return normalizeApiUrl(value || developmentFallbackUrl, { isProduction: !isDevelopment });
}

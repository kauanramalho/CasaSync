const TOKEN_KEY = "casasync_token";
const SESSION_TOKEN_KEY = "casasync_session_token";
const PENDING_TWO_FACTOR_KEY = "casasync_pending_2fa";
const AUTH_SESSION_CHANGED_EVENT = "casasync:auth-session-changed";
const pendingGetRequests = new Map();
let cachedApiUrl = null;

function configuredApiUrl() {
  return (import.meta.env.VITE_API_URL || import.meta.env.NEXT_PUBLIC_API_URL || "").trim();
}

function developmentFallbackApiUrl() {
  return `http://${["local", "host"].join("")}:8000/api`;
}

function isLocalApiHost(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === ["local", "host"].join("") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

function appendApiPrefix(pathname) {
  const path = pathname.replace(/\/+$/, "");
  return path.endsWith("/api") ? path : `${path}/api`;
}

function normalizeApiUrl(apiUrl) {
  const value = apiUrl.replace(/\/+$/, "");

  if (value.startsWith("/")) {
    if (import.meta.env.PROD) {
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

  if (import.meta.env.PROD) {
    if (parsedUrl.protocol !== "https:") {
      throw new Error("Em producao, VITE_API_URL deve usar HTTPS e apontar para o backend publico.");
    }
    if (isLocalApiHost(parsedUrl.hostname)) {
      throw new Error("VITE_API_URL de producao nao pode apontar para uma maquina local.");
    }
  }

  parsedUrl.pathname = appendApiPrefix(parsedUrl.pathname);
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.toString().replace(/\/+$/, "");
}

function getApiUrl() {
  if (cachedApiUrl) return cachedApiUrl;

  const apiUrl = configuredApiUrl();
  if (!apiUrl) {
    if (import.meta.env.DEV) {
      cachedApiUrl = normalizeApiUrl(developmentFallbackApiUrl());
      return cachedApiUrl;
    }
    throw new Error("API nao configurada. Defina VITE_API_URL com a URL publica do backend.");
  }

  cachedApiUrl = normalizeApiUrl(apiUrl);
  return cachedApiUrl;
}

function apiPath(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function setToken(token, { remember = true } = {}) {
  clearToken();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(remember ? TOKEN_KEY : SESSION_TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export function getPendingTwoFactor() {
  const raw = sessionStorage.getItem(PENDING_TWO_FACTOR_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(PENDING_TWO_FACTOR_KEY);
    return null;
  }
}

export function setPendingTwoFactor(payload) {
  sessionStorage.setItem(PENDING_TWO_FACTOR_KEY, JSON.stringify(payload));
}

export function clearPendingTwoFactor() {
  sessionStorage.removeItem(PENDING_TWO_FACTOR_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const cacheKey = method === "GET" ? `${auth ? getToken() || "anon" : "public"}:${path}` : "";
  if (cacheKey && pendingGetRequests.has(cacheKey)) {
    return pendingGetRequests.get(cacheKey);
  }

  const requestPromise = performRequest(path, { method, body, auth });
  if (cacheKey) {
    pendingGetRequests.set(cacheKey, requestPromise);
    requestPromise.then(
      () => pendingGetRequests.delete(cacheKey),
      () => pendingGetRequests.delete(cacheKey)
    );
  }

  return requestPromise;
}

async function performRequest(path, { method = "GET", body, auth = true } = {}) {
  const url = `${getApiUrl()}${apiPath(path)}`;
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (import.meta.env.DEV) {
    console.info("[CasaSync API]", method, url);
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: "omit",
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[CasaSync API]", "network-error", method, url, error);
    }
    throw new Error(
      "Nao foi possivel conectar a API. O servidor pode estar indisponivel ou bloqueando a origem do site."
    );
  }

  if (import.meta.env.DEV) {
    console.info("[CasaSync API]", response.status, method, url);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    if (auth && response.status === 401) {
      clearToken();
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
    }
    const detail = extractApiErrorMessage(data);
    throw new Error(detail || "Nao foi possivel concluir a acao.");
  }

  return data;
}

function extractApiErrorMessage(data) {
  const detail = data?.detail ?? data?.message ?? data?.error;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const message = item?.msg || item?.message;
        if (!message) return null;
        const location = Array.isArray(item?.loc)
          ? item.loc.filter((part) => part !== "body").join(".")
          : "";
        return location ? `${location}: ${message}` : message;
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof detail === "string") return detail;
  return null;
}

export const authApi = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  verifyTwoFactor: (payload) => request("/auth/2fa/verify", { method: "POST", body: payload, auth: false }),
  resendTwoFactor: (payload) => request("/auth/2fa/resend", { method: "POST", body: payload, auth: false }),
  me: () => request("/auth/me"),
  updateMe: (payload) => request("/auth/me", { method: "PATCH", body: payload }),
  changePassword: (payload) => request("/auth/me/password", { method: "POST", body: payload }),
  logout: () => request("/auth/logout", { method: "POST" }),
  deleteMe: () => request("/auth/me", { method: "DELETE" })
};

export const familiesApi = {
  list: () => request("/families"),
  current: () => request("/families/current"),
  create: (payload) => request("/families", { method: "POST", body: payload }),
  join: (payload) => request("/families/join", { method: "POST", body: payload }),
  members: () => request("/families/current/members"),
  joinRequests: () => request("/families/current/join-requests"),
  approveJoinRequest: (requestId) => request(`/families/current/join-requests/${requestId}/approve`, { method: "POST" }),
  rejectJoinRequest: (requestId) => request(`/families/current/join-requests/${requestId}/reject`, { method: "POST" }),
  updateCurrent: (payload) => request("/families/current", { method: "PATCH", body: payload }),
  regenerateCode: () => request("/families/current/regenerate-code", { method: "POST" }),
  updateMember: (memberId, payload) => request(`/families/current/members/${memberId}`, { method: "PATCH", body: payload }),
  removeMember: (memberId) => request(`/families/current/members/${memberId}`, { method: "DELETE" }),
  leaveCurrent: () => request("/families/current/leave", { method: "POST" }),
  deleteCurrent: () => request("/families/current", { method: "DELETE" })
};

export const categoriesApi = {
  list: () => request("/categories"),
  create: (payload) => request("/categories", { method: "POST", body: payload }),
  update: (id, payload) => request(`/categories/${id}`, { method: "PATCH", body: payload })
};

export const tasksApi = {
  list: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request(`/tasks${query ? `?${query}` : ""}`);
  },
  create: (payload) => request("/tasks", { method: "POST", body: payload }),
  update: (id, payload) => request(`/tasks/${id}`, { method: "PATCH", body: payload }),
  complete: (id) => request(`/tasks/${id}/complete`, { method: "POST" }),
  delete: (id) => request(`/tasks/${id}`, { method: "DELETE" }),
  remindersDue: () => request("/tasks/reminders/due")
};

export const dashboardApi = {
  get: () => request("/dashboard")
};

export const coupleApi = {
  get: () => request("/couple-space"),
  createGoal: (payload) => request("/couple-space/goals", { method: "POST", body: payload }),
  updateGoal: (id, payload) => request(`/couple-space/goals/${id}`, { method: "PATCH", body: payload }),
  deleteGoal: (id) => request(`/couple-space/goals/${id}`, { method: "DELETE" }),
  createDateIdea: (payload) => request("/couple-space/date-ideas", { method: "POST", body: payload }),
  updateDateIdea: (id, payload) => request(`/couple-space/date-ideas/${id}`, { method: "PATCH", body: payload }),
  deleteDateIdea: (id) => request(`/couple-space/date-ideas/${id}`, { method: "DELETE" }),
  createNote: (payload) => request("/couple-space/notes", { method: "POST", body: payload }),
  updateNote: (id, payload) => request(`/couple-space/notes/${id}`, { method: "PATCH", body: payload }),
  deleteNote: (id) => request(`/couple-space/notes/${id}`, { method: "DELETE" })
};

export const integrationsApi = {
  googleCalendarStatus: () => request("/integrations/google-calendar/status"),
  googleCalendarConnectUrl: () => request("/integrations/google-calendar/connect-url")
};

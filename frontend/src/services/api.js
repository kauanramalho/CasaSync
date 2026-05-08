const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
const TOKEN_KEY = "casasync_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = Array.isArray(data?.detail)
      ? data.detail.map((item) => item.msg).join(", ")
      : data?.detail;
    throw new Error(detail || "Não foi possível concluir a ação.");
  }

  return data;
}

export const authApi = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/auth/me")
};

export const familiesApi = {
  list: () => request("/families"),
  create: (payload) => request("/families", { method: "POST", body: payload }),
  join: (payload) => request("/families/join", { method: "POST", body: payload }),
  members: () => request("/families/current/members")
};

export const categoriesApi = {
  list: () => request("/categories"),
  create: (payload) => request("/categories", { method: "POST", body: payload })
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
  complete: (id) => request(`/tasks/${id}/complete`, { method: "POST" })
};

export const dashboardApi = {
  get: () => request("/dashboard")
};

export const coupleApi = {
  get: () => request("/couple-space"),
  createGoal: (payload) => request("/couple-space/goals", { method: "POST", body: payload }),
  createDateIdea: (payload) => request("/couple-space/date-ideas", { method: "POST", body: payload }),
  createNote: (payload) => request("/couple-space/notes", { method: "POST", body: payload })
};

export const plannerApi = {
  suggest: (prompt) => request("/planner/suggest", { method: "POST", body: { prompt } }),
  createTasks: (payload) => request("/planner/create-tasks", { method: "POST", body: payload })
};

export const integrationsApi = {
  googleCalendarStatus: () => request("/integrations/google-calendar/status"),
  googleCalendarConnectUrl: () => request("/integrations/google-calendar/connect-url")
};


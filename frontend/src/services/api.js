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
  me: () => request("/auth/me"),
  updateMe: (payload) => request("/auth/me", { method: "PATCH", body: payload }),
  changePassword: (payload) => request("/auth/me/password", { method: "POST", body: payload })
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
  delete: (id) => request(`/tasks/${id}`, { method: "DELETE" })
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

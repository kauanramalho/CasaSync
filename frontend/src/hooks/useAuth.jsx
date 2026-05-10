import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authApi, clearToken, getToken, setToken } from "../services/api";
import { AUTH_SESSION_CHANGED_EVENT, emitAuthSessionChanged } from "../utils/events";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadSession() {
      if (!getToken()) {
        setLoading(false);
        return;
      }

      try {
        const me = await authApi.me();
        if (alive) setUser(me);
      } catch {
        clearToken();
        if (alive) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSession();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function syncSession(event) {
      if (event.type === "storage" && event.key !== "casasync_token") return;
      if (!getToken()) {
        setUser(null);
      }
    }

    window.addEventListener("storage", syncSession);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    };
  }, []);

  async function login(payload) {
    const response = await authApi.login(payload);
    setToken(response.access_token);
    setUser(response.user);
    return response.user;
  }

  async function register(payload) {
    const response = await authApi.register(payload);
    setToken(response.access_token);
    setUser(response.user);
    return response.user;
  }

  async function logout() {
    try {
      if (getToken()) await authApi.logout();
    } catch {
      // Local session cleanup still wins if the server already rejected the token.
    } finally {
      clearToken();
      setUser(null);
      emitAuthSessionChanged();
    }
  }

  async function deleteAccount() {
    await authApi.deleteMe();
    clearToken();
    setUser(null);
    emitAuthSessionChanged();
  }

  function updateUser(nextUser) {
    setUser(nextUser);
  }

  async function refreshUser() {
    const me = await authApi.me();
    setUser(me);
    return me;
  }

  const value = useMemo(
    () => ({ user, loading, login, register, logout, deleteAccount, updateUser, refreshUser }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth precisa estar dentro de AuthProvider.");
  }
  return value;
}

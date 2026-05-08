import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authApi, clearToken, getToken, setToken } from "../services/api";

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

  function logout() {
    clearToken();
    setUser(null);
  }

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth precisa estar dentro de AuthProvider.");
  }
  return value;
}


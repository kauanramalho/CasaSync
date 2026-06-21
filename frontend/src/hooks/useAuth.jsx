import { createContext, useContext, useEffect, useState } from "react";

import {
  authApi,
  clearPendingTwoFactor,
  clearToken,
  getPendingTwoFactor,
  getToken,
  setPendingTwoFactor,
  setToken
} from "../services/api";
import { AUTH_SESSION_CHANGED_EVENT, emitAuthSessionChanged } from "../utils/events";
import { isTwoFactorRequiredResponse } from "../utils/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [twoFactor, setTwoFactor] = useState(() => getPendingTwoFactor());
  const [loading, setLoading] = useState(true);

  function storePendingTwoFactor(response) {
    setPendingTwoFactor(response);
    setTwoFactor(response);
  }

  function beginTwoFactor(response, options = {}) {
    clearToken();
    setUser(null);
    storePendingTwoFactor({ ...response, remember_session: options.rememberSession ?? true });
  }

  function clearPendingChallenge() {
    clearPendingTwoFactor();
    setTwoFactor(null);
  }

  function completeAuth(response, options = {}) {
    clearPendingChallenge();
    setToken(response.access_token, { remember: options.rememberSession ?? true });
    setUser(response.user);
    emitAuthSessionChanged();
    return response.user;
  }

  useEffect(() => {
    let alive = true;

    async function loadSession() {
      if (!getToken()) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const me = await authApi.me();
        if (alive) setUser(me);
      } catch (error) {
        if (error?.status === 401) {
          clearToken();
        }
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
        clearPendingChallenge();
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

  async function login(payload, options = {}) {
    const response = await authApi.login(payload);
    if (isTwoFactorRequiredResponse(response)) {
      beginTwoFactor(response, options);
      return response;
    }
    return completeAuth(response, options);
  }

  async function register(payload) {
    const response = await authApi.register(payload);
    if (isTwoFactorRequiredResponse(response)) {
      beginTwoFactor(response);
      return response;
    }
    return completeAuth(response);
  }

  async function verifyTwoFactor(code) {
    const pending = getPendingTwoFactor();
    if (!pending?.pending_token) {
      throw new Error("Sessao de verificacao expirada. Entre novamente.");
    }
    const response = await authApi.verifyTwoFactor({ pending_token: pending.pending_token, code });
    return completeAuth(response, { rememberSession: pending.remember_session ?? true });
  }

  async function resendTwoFactor() {
    const pending = getPendingTwoFactor();
    if (!pending?.pending_token) {
      throw new Error("Sessao de verificacao expirada. Entre novamente.");
    }
    const response = await authApi.resendTwoFactor({ pending_token: pending.pending_token });
    storePendingTwoFactor({ ...response, remember_session: pending.remember_session ?? true });
    return response;
  }

  async function logout() {
    try {
      if (getToken()) await authApi.logout();
    } catch {
      // Local session cleanup still wins if the server already rejected the token.
    } finally {
      clearToken();
      clearPendingChallenge();
      setUser(null);
      emitAuthSessionChanged();
    }
  }

  async function deleteAccount(currentPassword) {
    await authApi.deleteMe({ current_password: currentPassword });
    clearToken();
    clearPendingChallenge();
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

  const value = {
    user,
    twoFactor,
    loading,
    login,
    register,
    verifyTwoFactor,
    resendTwoFactor,
    beginTwoFactor,
    clearPendingChallenge,
    logout,
    deleteAccount,
    updateUser,
    refreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth precisa estar dentro de AuthProvider.");
  }
  return value;
}

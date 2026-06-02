import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./useAuth";
import { clearActiveFamilyId, clearApiReadCache, familiesApi, getActiveFamilyId, setActiveFamilyId } from "../services/api";
import { emitActiveFamilyChanged } from "../utils/events";

const ActiveFamilyContext = createContext(null);

function sameFamily(left, right) {
  return String(left || "") === String(right || "");
}

export function ActiveFamilyProvider({ children }) {
  const { user } = useAuth();
  const [families, setFamilies] = useState([]);
  const [activeFamily, setActiveFamily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const loadFamilies = useCallback(async ({ preferFamilyId, announceChange = false } = {}) => {
    if (!user?.id) {
      clearActiveFamilyId();
      setFamilies([]);
      setActiveFamily(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError("");

    try {
      const rows = await familiesApi.list();
      setFamilies(rows);

      if (!rows.length) {
        clearActiveFamilyId();
        setActiveFamily(null);
        return null;
      }

      let backendActiveFamily = null;
      try {
        backendActiveFamily = await familiesApi.active();
      } catch (activeError) {
        if (activeError?.status !== 404) {
          throw activeError;
        }
      }

      const storedFamilyId = preferFamilyId || backendActiveFamily?.id || user.active_family_id || getActiveFamilyId();
      const selected = rows.find((family) => sameFamily(family.id, storedFamilyId)) || backendActiveFamily || rows[0];
      const shouldAnnounceChange = announceChange || Boolean(storedFamilyId && !sameFamily(storedFamilyId, selected.id));
      const validatedFamily = backendActiveFamily && sameFamily(backendActiveFamily.id, selected.id)
        ? backendActiveFamily
        : await familiesApi.activate(selected.id);
      setActiveFamilyId(validatedFamily.id);
      setActiveFamily(validatedFamily);
      if (shouldAnnounceChange) emitActiveFamilyChanged(validatedFamily.id);
      return validatedFamily;
    } catch (loadError) {
      setError(loadError.message || "Nao foi possivel carregar as familias.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user?.active_family_id, user?.id]);

  useEffect(() => {
    loadFamilies();
  }, [loadFamilies]);

  const switchFamily = useCallback(async (familyId) => {
    const normalizedFamilyId = String(familyId || "").trim();
    if (!normalizedFamilyId || sameFamily(activeFamily?.id, normalizedFamilyId)) return activeFamily;

    setSwitching(true);
    setError("");
    try {
      const validatedFamily = await familiesApi.activate(normalizedFamilyId);
      setActiveFamilyId(validatedFamily.id);
      clearApiReadCache();
      setFamilies((current) => (
        current.some((family) => sameFamily(family.id, validatedFamily.id))
          ? current
          : [validatedFamily, ...current]
      ));
      setActiveFamily(validatedFamily);
      emitActiveFamilyChanged(validatedFamily.id);
      return validatedFamily;
    } catch (switchError) {
      setError(switchError.message || "Nao foi possivel trocar a familia ativa.");
      throw switchError;
    } finally {
      setSwitching(false);
    }
  }, [activeFamily]);

  const refreshFamilies = useCallback(async () => loadFamilies({ preferFamilyId: activeFamily?.id }), [activeFamily?.id, loadFamilies]);

  const value = useMemo(
    () => ({
      activeFamily,
      error,
      families,
      loading,
      refreshFamilies,
      switchFamily,
      switching
    }),
    [activeFamily, error, families, loading, refreshFamilies, switchFamily, switching]
  );

  return <ActiveFamilyContext.Provider value={value}>{children}</ActiveFamilyContext.Provider>;
}

export function useActiveFamily() {
  const context = useContext(ActiveFamilyContext);
  if (!context) {
    throw new Error("useActiveFamily must be used inside ActiveFamilyProvider");
  }
  return context;
}

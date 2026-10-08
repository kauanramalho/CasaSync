import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { applyPalette, getPalette, getStoredPaletteId, palettes, persistPalette } from "../utils/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [paletteId, setPaletteId] = useState(getStoredPaletteId);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    applyPalette(paletteId);
  }, [paletteId]);

  function selectPalette(nextPaletteId) {
    const nextId = applyPalette(nextPaletteId);
    setStorageAvailable(persistPalette(nextId));
    setPaletteId(nextId);
  }

  const value = useMemo(
    () => ({
      paletteId,
      palette: getPalette(paletteId),
      storageAvailable,
      palettes,
      selectPalette
    }),
    [paletteId, storageAvailable]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme precisa estar dentro de ThemeProvider.");
  }
  return value;
}

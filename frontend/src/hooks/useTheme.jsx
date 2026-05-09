import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { applyPalette, getPalette, getStoredPaletteId, palettes, THEME_STORAGE_KEY } from "../utils/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [paletteId, setPaletteId] = useState(getStoredPaletteId);

  useEffect(() => {
    applyPalette(paletteId);
  }, [paletteId]);

  function selectPalette(nextPaletteId) {
    const nextId = applyPalette(nextPaletteId);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextId);
    setPaletteId(nextId);
  }

  const value = useMemo(
    () => ({
      paletteId,
      palette: getPalette(paletteId),
      palettes,
      selectPalette
    }),
    [paletteId]
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

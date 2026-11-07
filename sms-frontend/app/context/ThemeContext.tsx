"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { createTheme, ThemeProvider as MuiThemeProvider, useTheme as useMuiTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

type ThemeMode = "light" | "dark";
type SchoolixTheme = Theme & { toggleMode?: () => void };

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// One provider and preference source for Tailwind and MUI, including portals.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The root bootstrap has already validated/applied the saved preference.
  const [mode, setMode] = useState<ThemeMode>(() =>
    typeof document === "undefined" || document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);

  const theme = useMemo(() => {
    const dark = mode === "dark";
    const next = createTheme({
      palette: {
        mode,
        primary: { main: dark ? "#b8a6f7" : "#6846c0" },
        background: { default: dark ? "#0d1117" : "#ffffff", paper: dark ? "#1a2233" : "#ffffff" },
        text: { primary: dark ? "#f1f5f9" : "#0f172a", secondary: dark ? "#cbd5e1" : "#475569" },
        divider: dark ? "#46536a" : "#cbd5e1",
        error: { main: dark ? "#fca5a5" : "#b91c1c" },
        success: { main: dark ? "#6ee7b7" : "#047857" },
      },
      typography: { fontFamily: "Arial, Helvetica, sans-serif" },
      components: {
        MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
        MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: "var(--input)" } } },
        MuiButton: { styleOverrides: {
          containedPrimary: { backgroundColor: "var(--button)", color: "var(--on-button)", "&:hover": { backgroundColor: "var(--button-hover)" } },
        } },
        MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: "var(--surface-hover)", color: "var(--foreground)", border: "1px solid var(--border)", fontSize: "0.75rem" } } },
      },
    }) as SchoolixTheme;
    next.toggleMode = () => {
      const nextMode = mode === "light" ? "dark" : "light";
      try { localStorage.setItem("theme-mode", nextMode); } catch { /* Switching still works without persistence. */ }
      document.documentElement.classList.toggle("dark", nextMode === "dark");
      setMode(nextMode);
    };
    return next;
  }, [mode]);

  if (!hydrated) return null;
  return <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>;
}

export function useTheme() {
  const theme = useMuiTheme<SchoolixTheme>();
  return { mode: theme.palette.mode, toggleMode: theme.toggleMode ?? (() => {}) };
}

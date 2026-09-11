"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "dark",
  toggleMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme-mode") as ThemeMode | null;
    const initial = saved ?? "dark"; // dark-first default, per our earlier decision
    setMode(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    setHydrated(true);
  }, []);

  const toggleMode = () => {
    setMode((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      localStorage.setItem("theme-mode", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  };

  // Avoid a flash of wrong theme before hydration reads localStorage
  if (!hydrated) return null;

  return (
    <ThemeContext.Provider value={{ mode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
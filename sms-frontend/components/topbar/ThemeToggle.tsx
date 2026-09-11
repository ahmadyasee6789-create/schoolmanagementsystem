"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/app/context/ThemeContext";

export default function ThemeToggle() {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      onClick={toggleMode}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-[#8B6DF2] hover:text-[#8B6DF2] dark:border-white/10 dark:text-slate-400 dark:hover:border-[#8B6DF2] dark:hover:text-[#8B6DF2]"
    >
      {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
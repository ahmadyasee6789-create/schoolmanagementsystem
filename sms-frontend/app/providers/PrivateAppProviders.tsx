"use client";

import { Toaster } from "react-hot-toast";
import AuthHydration from "./AuthHydration";
import { ThemeProvider } from "../context/ThemeContext";
import QueryProvider from "./QueryProvider";

export default function PrivateAppProviders({ children }: { children: React.ReactNode }) {
  return <AuthHydration><ThemeProvider><Toaster toastOptions={{ style: { background: "var(--dialog)", color: "var(--foreground)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" } }} /><QueryProvider>{children}</QueryProvider></ThemeProvider></AuthHydration>;
}

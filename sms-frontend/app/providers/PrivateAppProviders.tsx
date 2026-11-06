"use client";

import { Toaster } from "react-hot-toast";
import AuthHydration from "./AuthHydration";
import { ThemeProvider } from "../context/ThemeContext";
import QueryProvider from "./QueryProvider";

export default function PrivateAppProviders({ children }: { children: React.ReactNode }) {
  return <AuthHydration><ThemeProvider><Toaster /><QueryProvider>{children}</QueryProvider></ThemeProvider></AuthHydration>;
}

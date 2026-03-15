// app/providers/AuthProvider.tsx
"use client";

import { useSessionRefresh } from "../hooks/useSessionRefresh";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useSessionRefresh();
  return <>{children}</>;
}

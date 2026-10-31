"use client";

import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/authStore";

function ScopedQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        retry: (count, error) => count < 1 && !(isAxiosError(error) && (error.response?.status ?? 500) < 500),
      },
      mutations: { retry: false },
    },
  }));
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  // A fresh client on account/organization/role changes prevents cached tenant data reuse.
  return <ScopedQueryProvider key={`${user?.id ?? "anonymous"}:${user?.org_id ?? "none"}:${user?.org_role ?? "none"}`}>
    {children}
  </ScopedQueryProvider>;
}

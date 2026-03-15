"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { refreshApi } from "../lib/refreshApi";

const REFRESH_BEFORE = 60 * 1000; // Refresh 1 minute before expiry

export function useSessionRefresh() {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { expiresAt, refreshToken, setSession, logout } = useAuthStore();

  useEffect(() => {
    if (!expiresAt || !refreshToken) return;

    const refreshIn = expiresAt - Date.now() - REFRESH_BEFORE;



    if (refreshIn <= 0) {
      refresh();
      return;
    }

    timerRef.current = setTimeout(refresh, refreshIn);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [expiresAt, refreshToken]);

  async function refresh() {
    try {
      const res = await refreshApi.post("/auth/refresh", {
        refresh_token: refreshToken,
      });

     

      setSession(res.data.access_token, res.data.expires_in, res.data.refresh_token);
    } catch (err) {
      console.error("Refresh failed", err);
      logout();
      window.location.href = "/signin";
    }
  }
}
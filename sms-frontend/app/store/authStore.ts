import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

type User = {
  id: number;
  full_name: string;
  email: string;
  org_id?: number;
  org_role?: string;
  org_name?: string;
  is_superadmin?: boolean;
};

type AuthState = {
  user: User | null;
  token: string | null;
  expiresAt: number | null;
  loading: boolean;
  hydrated: boolean;
  authReady: boolean;
  refreshToken: string | null;

  setSession: (token: string, expiresIn: number, refreshToken: string) => void;
  clearSession: () => void;
  setToken: (token: string) => void;

  login: (email: string, password: string) => Promise<string>;
  hydrate: () => Promise<void>;
  refreshTokenRequest: () => Promise<boolean>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      expiresAt: null,
      refreshToken: null,
      loading: true,
      hydrated: false,
      authReady: false,

      setSession: (token, expiresIn, refreshToken) =>
        set({
          token,
          expiresAt: Date.now() + expiresIn * 1000,
          refreshToken,
        }),

      clearSession: () =>
        set({
          token: null,
          user: null,
          expiresAt: null,
          loading: false,
          hydrated: true,
          authReady: false,
          refreshToken: null,
        }),

      setToken: (token) => set({ token }),

      login: async (email, password) => {
        set({ loading: true });
        const res = await api.post("/auth/login", { email, password });

        get().setSession(res.data.access_token, res.data.expires_in, res.data.refresh_token);

        set({
              user: {
       ...res.data.user,
      org_name: res.data.user.org_name,
      is_superadmin: res.data.user.is_superadmin,},
          // user: res.data.user,
          loading: false,
          hydrated: true,
          authReady: true,
        });
        return res.data.redirect
      },

      refreshTokenRequest: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) return false;

        try {
          const res = await api.post("/auth/refresh", { refresh_token: refreshToken });
          get().setSession(res.data.access_token, res.data.expires_in, res.data.refresh_token);
          return true;
        } catch {
          get().clearSession();
          return false;
        }
      },

      hydrate: async () => {
        const token = get().token;

        if (!token) {
          set({ loading: false, hydrated: true, authReady: false });
          return;
        }

        try {
          const res = await api.get("/auth/me");
          set({
            user:{ ...res.data, org_name: res.data.org_name, },
            //
            // user: res.data,
            loading: false,
            hydrated: true,
            authReady: true,
          });
        } catch (err: any) {
          // If 401 → try refresh token
          if (err.response?.status === 401) {
            const refreshed = await get().refreshTokenRequest();
            if (refreshed) {
              // Retry /me after refresh
              const res = await api.get("/auth/me");
              set({
                user: { ...res.data, org_name: res.data.org_name, },
                // user: res.data,
                loading: false,
                hydrated: true,
                authReady: true,
              });
              return;
            }
          }
          get().clearSession();
        }
      },

      logout: () => {
        get().clearSession();
        localStorage.removeItem("auth-storage");
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        token: state.token,
        expiresAt: state.expiresAt,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);
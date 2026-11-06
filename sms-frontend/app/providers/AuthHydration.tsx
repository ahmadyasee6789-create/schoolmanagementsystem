"use client";

import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { usePathname, useRouter } from "next/navigation";
import { useSessionRefresh } from "../hooks/useSessionRefresh";
import { authenticatedHome } from "../lib/authRoutes";

const publicRoutes = ["/", "/signin", "/signup", "/organization/invitations/accept", "/forgot-password", "/reset-password"];

export default function AuthHydration({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);

  const router = useRouter();
  const pathname = usePathname();

  // ✅ Hydrate auth store once
  useEffect(() => {
    if (!hydrated) {
      hydrate().catch(() => {
        useAuthStore.setState({ hydrated: true, authReady: false });
      });
    }
  }, [hydrate, hydrated]);

  // ✅ Start token auto-refresh
  useSessionRefresh();

  // ✅ Route protection
// ✅ Route protection
useEffect(() => {
  if (!hydrated) return;

  const isPublic = publicRoutes.includes(pathname);

  if (!user && !isPublic) {
    router.replace("/signin");
    return;
  }

  // Where a logged-in user belongs, based on role
  if (user && pathname === "/signin") {
    router.replace(authenticatedHome(user));
    return;
  }

  // Superadmins should never sit on the regular dashboard route(s) —
  // stops /dashboard/stats from ever firing for an org-less superadmin.
  if (user?.is_superadmin && pathname !== "/superadmin" && !pathname.startsWith("/superadmin")) {
    router.replace("/superadmin");
    return;
  }

}, [hydrated, user, pathname, router]);

  if (!hydrated) return <p>Loading session...</p>;
  // Do not mount protected pages (and their queries) before a redirect completes.
  if (!user && !publicRoutes.includes(pathname)) return <p>Loading session...</p>;
  if (user && pathname === "/signin") return <p>Opening your workspace...</p>;
  if (user?.is_superadmin && !pathname.startsWith("/superadmin")) return <p>Opening your workspace...</p>;

  return <>{children}</>;
}

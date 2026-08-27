"use client";

import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { usePathname, useRouter } from "next/navigation";
import { useSessionRefresh } from "../hooks/useSessionRefresh";

export default function AuthHydration({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

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

  const publicRoutes = ["/signin", "/signup", "/organization/invitations/accept", "/forgot-password", "/reset-password"];
  const isPublic = publicRoutes.includes(pathname);

  if (!user && !isPublic) {
    router.replace("/signin");
    return;
  }

  // Where a logged-in user belongs, based on role
  const homeRouteFor = (u: typeof user) => {
    if (!u) return "/signin";
    if (u.is_superadmin) return "/superadmin";      // adjust field name if different
    return "/";                                     // normal org dashboard
  };

  if (user && pathname === "/signin") {
    router.replace(homeRouteFor(user));
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

  return <>{children}</>;
}
"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/authStore";

interface RequireOrgRoleProps {
  children: ReactNode;
  allowedRoles?: ("admin" | "manager" | "teacher" | "accountant")[];
  redirectTo?: string;
}

export default function RequireOrgRole({
  children,
  allowedRoles,
  redirectTo = "/unauthorized",
}: RequireOrgRoleProps) {
  const { user, token, loading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // Not logged in
    if (!token || !user) {
      router.replace("/signin");
      return;
    }

    // Role check
    if (allowedRoles) {
      // Admin bypass
      if (user.org_role === "admin") return;

      if (!user.org_role || !allowedRoles.includes(user.org_role as any)) {
        router.replace(redirectTo);
        return;
      }
    }
  }, [user, token, loading, allowedRoles, redirectTo, router]);

  // Loading state
  if (loading) return <div>Loading...</div>;

  // Prevent flicker
  if (!user) return null;

  return <>{children}</>;
}
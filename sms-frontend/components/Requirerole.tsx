"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/authStore";

interface RequireOrgRoleProps {
  children: ReactNode;
  allowedRoles?: ("admin" | "manager" | "teacher"|"accountant")[];
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

    // Only check org role if user is an org member
    if (
      allowedRoles &&
      user.org_role &&
      !allowedRoles.includes(user.org_role as any)
    ) {
      router.replace(redirectTo);
      return;
    }
  }, [user, token, loading, allowedRoles, redirectTo, router]);

  // Prevent rendering until auth/role check is done
  if (loading || !user) return null;

  return <>{children}</>;
}

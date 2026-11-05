"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/authStore";
import ExamResultsWorkspace from "@/components/exams/ExamResultsWorkspace";
import { LoadingState } from "@/components/exams/ExamUi";

export default function ExamResultsPage() {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, router, user]);
  if (loading || !user) return <LoadingState />;
  const scope = `${user.org_id}:${user.id}`;
  return <ExamResultsWorkspace key={scope} scope={scope} />;
}

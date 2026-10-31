"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/app/store/authStore";
import { getStudentDetails, getStudentResults, getStudents, updateStudent } from "@/app/lib/studentApi";
import type { StudentDetails, StudentUpdate } from "@/components/students/types";

export const studentKeys = {
  lists: ["students"] as const,
  detail: (id: number) => ["student", id] as const,
};

function useStudentAccess() {
  return useAuthStore((state) => state.hydrated && !!state.user?.org_id && !!state.token);
}

export function useStudentDetails(id: number) {
  const ready = useStudentAccess();
  return useQuery({
    queryKey: studentKeys.detail(id),
    queryFn: ({ signal }) => getStudentDetails(id, signal),
    enabled: ready && Number.isSafeInteger(id) && id > 0,
  });
}

export function useStudents({ page, search, grade }: { page: number; search: string; grade: string }) {
  const ready = useStudentAccess();
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);
  const params = { page, limit: 10, search: debouncedSearch, grade_name: grade === "all" ? undefined : grade };
  return useQuery({
    queryKey: [...studentKeys.lists, params],
    queryFn: ({ signal }) => getStudents(params, signal),
    enabled: ready,
  });
}

export function useUpdateStudent(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: StudentUpdate) => updateStudent(id, changes),
    onSuccess: async (profile) => {
      client.setQueryData<StudentDetails>(studentKeys.detail(id), (previous) => previous ? { ...previous, ...profile } : previous);
      await Promise.all([
        client.invalidateQueries({ queryKey: studentKeys.detail(id) }),
        client.invalidateQueries({ queryKey: studentKeys.lists }),
      ]);
    },
  });
}

export function useStudentResults(id: number) {
  const ready = useStudentAccess();
  return useQuery({
    queryKey: [...studentKeys.detail(id), "results"],
    queryFn: ({ signal }) => getStudentResults(id, signal),
    enabled: ready,
  });
}

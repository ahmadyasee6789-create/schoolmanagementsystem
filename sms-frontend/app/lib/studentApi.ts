import { isAxiosError } from "axios";
import { api } from "./api";
import type { Student, StudentDetails, StudentProfile, StudentSaveChanges } from "@/components/students/types";
import type { ExamPaper, ExamResult } from "@/components/exams/types";

export type StudentListParams = { page: number; limit: number; search: string; grade_name?: string };
export type StudentPage = { items: Student[]; page: number; total: number; total_pages: number };

export async function getStudents(params: StudentListParams, signal?: AbortSignal) {
  const { data } = await api.get<StudentPage>("/students", { params, signal });
  return data;
}

export async function getStudentDetails(id: number, signal?: AbortSignal) {
  const { data } = await api.get<StudentDetails>(`/students/${id}/details`, { signal });
  return data;
}

export async function updateStudent(id: number, changes: StudentSaveChanges) {
  // Personal fields and an explicitly confirmed enrollment discount save atomically.
  const { data } = await api.put<StudentProfile>(`/students/${id}`, changes);
  return data;
}

export async function getStudentResults(id: number, signal?: AbortSignal) {
  const { data: results } = await api.get<ExamResult[]>(`/exam-results/student/${id}`, { signal });
  if (!results.length) return { results, papers: [] as ExamPaper[] };
  const { data: papers } = await api.get<ExamPaper[]>("/exam-papers", { signal });
  return { results, papers };
}

type ValidationIssue = { loc?: (string | number)[]; msg?: string };
export function studentApiError(error: unknown, fallback = "Unable to load student information. Please try again.") {
  const fields: Record<string, string> = {};
  if (!isAxiosError<{ detail?: string | ValidationIssue[] }>(error)) return { message: fallback, fields };
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return { message: detail, fields };
  if (Array.isArray(detail)) {
    for (const issue of detail) {
      const key = issue.loc?.at(-1);
      if (typeof key === "string") fields[key] = issue.msg?.replace(/^Value error, /, "") || "Invalid value";
    }
    return { message: "Please correct the highlighted fields and try again.", fields };
  }
  if (error.response?.status === 403) return { message: "You do not have permission to access this student.", fields };
  if (error.response?.status === 401) return { message: "Your session has expired. Please sign in again.", fields };
  return { message: fallback, fields };
}

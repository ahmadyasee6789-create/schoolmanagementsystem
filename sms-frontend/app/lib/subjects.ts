import { isAxiosError } from "axios";
import { api } from "./api";

export type Subject = { id: number; name: string };
export type SubjectAssignment = { id: number; classroom_id: number; subject_id: number; classroom_name?: string; section?: string; subject_name?: string };
export type SubjectClassroom = { id: number; class_name?: string; grade_name?: string; section: string };
export type BulkSubjectsResult = { created_count: number; skipped_count: number };
export type BulkAssignmentResult = { assigned_count: number; skipped_count: number };

export async function getAllSubjects(signal?: AbortSignal): Promise<Subject[]> {
  const subjects: Subject[] = [];
  const limit = 200;
  for (let skip = 0; ; skip += limit) {
    const { data } = await api.get<Subject[]>("/subjects", { params: { skip, limit }, signal });
    if (!Array.isArray(data)) throw new Error("Invalid subjects response");
    subjects.push(...data);
    if (data.length < limit) return subjects;
  }
}

export function subjectError(error: unknown, fallback = "Unable to save. Refresh the list before retrying.") {
  if (isAxiosError<{ detail?: string | { msg?: string }[] }>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg || "Invalid details").join("; ");
  }
  return fallback;
}

export const subjectNameKey = (name: string) => name.trim().toLowerCase();

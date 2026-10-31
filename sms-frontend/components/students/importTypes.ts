export const STUDENT_IMPORT_FIELDS = [
  ["ignore", "Don't import"], ["full_name", "Full name"],
  ["first_name", "First name"], ["last_name", "Last name"],
  ["father_name", "Father's name"], ["mother_name", "Mother's name"],
  ["guardian_name", "Guardian's name"], ["phone", "Student / contact phone"],
  ["father_phone", "Father's phone"], ["guardian_phone", "Guardian's phone"],
  ["email", "Email"], ["date_of_birth", "Date of birth"], ["gender", "Gender"],
  ["grade", "Grade"], ["section", "Section"],
] as const;

export type ImportSheet = {
  index: number; name: string; hidden: boolean; selected: boolean;
  header_row: number; row_count: number; sample_rows: string[][];
  suggested_fields: Record<string, string>; suggested_classroom_id: number | null;
  heading: string;
};

export type ImportPreviewData = {
  batch_id: string; filename: string; sheets: ImportSheet[];
  classrooms: { id: number; grade: string; section: string; label: string }[];
  session: { id: number; name: string }; field_aliases: Record<string, string>;
  expires_at: string;
};

export type SheetMapping = {
  sheet_index: number; header_row: number; fields: Record<string, string>;
  classroom_id: number | null; selected: boolean;
};

export type ImportRow = {
  id: string; sheet: string; row: number; classroom: string;
  student: Record<string, string | number | null>;
  status: "ready" | "review" | "invalid"; errors: string[]; warnings: string[];
};

export type ImportValidation = {
  batch_id: string; validation_id: string; rows: ImportRow[];
  ignored_rows: number; ready: number; review: number; invalid: number;
};

export type ImportResult = { imported: number; skipped: number; batch_id: string };

export function importError(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => String(item.msg ?? "Invalid import options")).join("; ");
  return "The request could not be completed. Check your connection and try again.";
}

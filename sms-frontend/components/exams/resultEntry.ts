import { studentName, type ResultStudent } from "./types";

const rollOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareStudentRoll(a: ResultStudent, b: ResultStudent): number {
  const left = (a.roll_number ?? "").trim();
  const right = (b.roll_number ?? "").trim();
  const group = (roll: string) => !roll ? 2 : /^\d+$/.test(roll) ? 0 : 1;
  return group(left) - group(right)
    || rollOrder.compare(left, right)
    || rollOrder.compare(studentName(a), studentName(b))
    || rollOrder.compare(a.admission_no ?? "", b.admission_no ?? "")
    || a.enrollment_id - b.enrollment_id;
}

export const resultKey = (paperId: number, enrollmentId: number) => `${paperId}:${enrollmentId}`;

export function validMark(value: string, total: number): boolean {
  const mark = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(mark) && mark <= total;
}

export type OverallResult = {
  student_id: number;
  percentage: number;
  failed_count: number;
  result: "PASSED" | "FAILED";
};

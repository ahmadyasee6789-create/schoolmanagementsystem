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

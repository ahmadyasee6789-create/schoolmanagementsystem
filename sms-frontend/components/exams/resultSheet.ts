export type ResultColumn = { key: string; subject_name: string; total_marks: number };
export type SavedSubject = ResultColumn & { paper_id: number; subject_id: number; pass_marks: number; obtained_marks: number | null; grade: string | null; gpa: number | null };
export type SavedStudentResult = {
  student_id: number; enrollment_id: number; student_name: string; admission_no: string | null; roll_number: string | null;
  classroom_id: number; grade_name: string; section: string; exam_id: number; exam_name: string;
  subjects: SavedSubject[]; obtained_total: number; possible_total: number; percentage: number | null;
  grade: string | null; gpa: number | null; failed_count: number; missing_count: number; result: 'PASSED' | 'FAILED' | 'INCOMPLETE';
};
export type ResultSheet = { exam_id: number; exam_name: string; session_id: number; session_name: string; columns: ResultColumn[]; items: SavedStudentResult[] };

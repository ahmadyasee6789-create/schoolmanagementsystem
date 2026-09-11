export type ApiError = { response?: { data?: { detail?: string }; status?: number } };

export type Term = { id: number; name: string };
export type AcademicSession = { id: number; name: string; is_active: boolean };

export type Exam = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  weightage: number;
  is_published: boolean;
  is_locked: boolean;
  term_id: number;
  organization_id?: number;
  term?: Term;
};

export type ExamForm = {
  name: string;
  start_date: string;
  end_date: string;
  weightage: number;
  term_id: number;
};

export type Classroom = {
  id: number;
  grade_name: string | null;
  section: string;
  class_name?: string;
};

export type Subject = { id: number; name: string };

export type ExamPaper = {
  id: number;
  exam_id: number;
  classroom_id: number;
  subject_id: number;
  total_marks: number;
  pass_marks: number;
  exam_name: string;
  classroom_name: string;
  subject_name: string;
};

export type PaperForm = {
  exam_id: number;
  classroom_id: number;
  subject_id: number;
  total_marks: number;
  pass_marks: number;
};

export type DmcStudent = {
  id: number;
  first_name: string;
  last_name: string;
  roll_number: string | null;
  admission_no: string | null;
  enrollment_id: number;
};

export type ExamResult = {
  id: number;
  exam_paper_id: number;
  student_enrollment_id: number;
  obtained_marks: number;
  grade: string | null;
  gpa: number | null;
};

export const emptyExamForm: ExamForm = { name: "", start_date: "", end_date: "", weightage: 0, term_id: 0 };
export const emptyPaperForm: PaperForm = { exam_id: 0, classroom_id: 0, subject_id: 0, total_marks: 100, pass_marks: 40 };

export const classroomLabel = (classroom: Classroom) => {
  if (classroom.grade_name && classroom.section) return `${classroom.grade_name} – ${classroom.section}`;
  return classroom.grade_name || classroom.class_name || classroom.section || `Class #${classroom.id}`;
};

export const examStatus = (exam: Exam) => exam.is_locked ? "locked" : exam.is_published ? "published" : "draft";

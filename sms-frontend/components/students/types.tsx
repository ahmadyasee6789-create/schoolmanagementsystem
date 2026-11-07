export type Grade = { id: number; name: string };

export type Classroom = {
  id: number;
  grade_id: number;
  section: string;
  grade_name: string;
};

export type StudentProfile = {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  is_active: boolean;
};

export type Student = StudentProfile & {
  grade_name?: string | null;
  section?: string | null;
  roll_number?: string | null;
  discount_percent?: number | null;
};

export type StudentEnrollment = {
  id: number;
  session_id: number;
  session_name: string | null;
  classroom_id: number | null;
  class_name: string | null;
  grade_name: string | null;
  section: string | null;
  roll_number: string | null;
  discount_percent: number;
  enrollment_date: string;
  withdrawal_date: string | null;
  is_active: boolean;
};

export type StudentDetails = StudentProfile & {
  active_session: { id: number; name: string } | null;
  current_enrollment: StudentEnrollment | null;
};

export type StudentUpdate = Partial<Omit<StudentProfile, "id" | "admission_no">>;

export type StudentSaveChanges = StudentUpdate & {
  enrollment_discount?: {
    enrollment_id: number;
    session_id: number;
    discount_percent: string;
    expected_discount_percent: string;
    confirmed: true;
  };
};

export type StudentFormData = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  father_name: string;
  father_phone: string;
  mother_name: string;
  guardian_name: string;
  guardian_phone: string;
  gender: string;
  date_of_birth: string;
  classroom_id: number;
  discount_percent: number;
  enrollment_date: string;
};

export type ApiError = { response?: { data?: { detail?: string } } };

export const emptyStudentForm: StudentFormData = {
  id: 0,
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  father_name: "",
  father_phone: "",
  mother_name: "",
  guardian_name: "",
  guardian_phone: "",
  gender: "male",
  date_of_birth: "",
  classroom_id: 0,
  discount_percent: 0,
  enrollment_date: new Date().toISOString().split("T")[0],
};

// Shared Tailwind class fragments used across the students components.


export { inputClass, secondaryButtonClass } from "@/components/exams/ExamUi";

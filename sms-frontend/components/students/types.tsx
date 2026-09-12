export type Grade = { id: number; name: string };

export type Classroom = {
  id: number;
  grade_id: number;
  section: string;
  grade_name: string;
};

export type Student = {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  gender: string;
  date_of_birth: string;
  is_active: boolean;
  grade_name?: string;
  section?: string;
  roll_number?: number;
  discount_percent?: number;
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
export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500";

export const secondaryButtonClass =
  "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";
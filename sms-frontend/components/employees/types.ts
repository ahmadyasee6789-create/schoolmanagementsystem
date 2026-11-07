export type Employee = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  joining_date: string;
  status: string;
  source: "employee" | "member";
};

export type EmployeeFormData = {
  full_name: string;
  email: string;
  phone: string;
  role: string;
  joining_date: string;
  status: string;
};

export const emptyEmployeeForm: EmployeeFormData = {
  full_name: "",
  email: "",
  phone: "",
  role: "",
  joining_date: "",
  status: "active",
};



export function formatDate(d?: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
export { inputClass, secondaryButtonClass } from "@/components/exams/ExamUi";

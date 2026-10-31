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

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500";

export const secondaryButtonClass =
  "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";

export function formatDate(d?: string): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
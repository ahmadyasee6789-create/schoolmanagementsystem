import { GraduationCap, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { Badge, panelClass } from "@/components/finance/FinanceUi";
import type { StudentDetails } from "./types";

export function displayDate(value: string | null | undefined) {
  if (!value) return "Not provided";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "Not provided" : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function StudentStatus({ active }: { active: boolean }) {
  return <Badge tone={active ? "green" : "slate"}><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />{active ? "Active" : "Inactive"}</Badge>;
}

function InformationSection({ title, icon: Icon, children, wide = false }: { title: string; icon: LucideIcon; children: React.ReactNode; wide?: boolean }) {
  return <section className={`${panelClass} ${wide ? "xl:col-span-2" : ""}`} aria-label={title}>
    <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-sm font-bold text-slate-900 dark:border-white/5 dark:text-slate-100"><Icon size={17} className="text-[#8B6DF2]" />{title}</h2>
    <dl className={`grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 ${wide ? "lg:grid-cols-3 xl:grid-cols-4" : ""}`}>{children}</dl>
  </section>;
}

function Detail({ label, children }: { label: string; children?: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium text-slate-900 dark:text-slate-100">{children || <span className="font-normal text-slate-400 dark:text-slate-500">Not provided</span>}</dd></div>;
}

export default function StudentOverview({ student }: { student: StudentDetails }) {
  const enrollment = student.current_enrollment;
  return <div className="space-y-5">
    {!enrollment && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300">{student.active_session ? `This student has no enrollment in ${student.active_session.name}.` : "No academic session is currently active. The student profile is still available."}</div>}
    <div className="grid gap-5 xl:grid-cols-2">
      <InformationSection title="Personal information" icon={UserRound}>
        <Detail label="First name">{student.first_name}</Detail><Detail label="Last name">{student.last_name}</Detail>
        <Detail label="Gender">{student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : null}</Detail>
        <Detail label="Date of birth">{displayDate(student.date_of_birth)}</Detail>
        <Detail label="Phone">{student.phone}</Detail><Detail label="Email">{student.email}</Detail>
        <Detail label="Student status"><StudentStatus active={student.is_active} /></Detail>
      </InformationSection>
      <InformationSection title="Parent and guardian information" icon={UsersRound}>
        <Detail label="Father’s name">{student.father_name}</Detail><Detail label="Father’s phone">{student.father_phone}</Detail>
        <Detail label="Mother’s name">{student.mother_name}</Detail><Detail label="Guardian name">{student.guardian_name}</Detail><Detail label="Guardian phone">{student.guardian_phone}</Detail>
      </InformationSection>
      <InformationSection title="Academic information" icon={GraduationCap} wide>
        <Detail label="Admission number">{student.admission_no}</Detail>
        <Detail label="Current academic session">{student.active_session?.name ?? "No active session"}</Detail>
        <Detail label="Class and section">{enrollment?.class_name ?? "Not assigned"}</Detail>
        <Detail label="Roll number">{enrollment?.roll_number}</Detail>
        <Detail label="Enrollment date">{displayDate(enrollment?.enrollment_date)}</Detail>
        <Detail label="Discount percentage">{enrollment ? `${enrollment.discount_percent}%` : "Not applicable"}</Detail>
        <Detail label="Enrollment status">{enrollment ? <StudentStatus active={enrollment.is_active} /> : "Not enrolled"}</Detail>
        {enrollment?.withdrawal_date && <Detail label="Withdrawal date">{displayDate(enrollment.withdrawal_date)}</Detail>}
      </InformationSection>
    </div>
    <p className="text-xs text-slate-500 dark:text-slate-400">Class, section, roll number, session and discount are managed through enrollment.</p>
  </div>;
}

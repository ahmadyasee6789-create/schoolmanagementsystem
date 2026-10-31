"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isAxiosError } from "axios";
import { ArrowLeft, CalendarCheck, FileText, GraduationCap, Hash, Pencil, UserRound, Wallet } from "lucide-react";
import { useStudentDetails } from "@/app/hooks/useStudents";
import { studentApiError } from "@/app/lib/studentApi";
import { useAuthStore } from "@/app/store/authStore";
import { primaryButtonClass } from "@/components/exams/ExamUi";
import { InitialsAvatar, panelClass } from "@/components/finance/FinanceUi";
import EditStudentDialog from "@/components/students/EditStudentDialog";
import StudentOverview, { StudentStatus } from "@/components/students/StudentOverview";
import { StudentAttendanceTab, StudentFeesTab, StudentResultsTab } from "@/components/students/StudentActivityTabs";
import { StudentError, StudentSkeleton } from "@/components/students/StudentDetailStates";

const tabs = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "fees", label: "Fees", icon: Wallet },
  { id: "attendance", label: "Attendance", icon: CalendarCheck },
  { id: "results", label: "Results", icon: FileText },
] as const;
type Tab = typeof tabs[number]["id"];

function StudentDetailsContent({ studentId }: { studentId: number }) {
  const query = useStudentDetails(studentId);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const role = useAuthStore((state) => state.user?.org_role);
  const canEdit = !!role && ["manager", "admin", "teacher"].includes(role);

  if (!Number.isSafeInteger(studentId) || studentId <= 0) return <StudentError message="This student link is invalid. Return to Students and select a student." />;
  if (query.isPending) return <StudentSkeleton />;
  if (query.isError) {
    const unavailable = isAxiosError(query.error) && [403, 404].includes(query.error.response?.status ?? 0);
    return <StudentError message={unavailable ? "Student not found or unavailable to your account. Return to Students to choose another record." : studentApiError(query.error).message} retry={unavailable ? undefined : () => void query.refetch()} />;
  }
  const student = query.data;
  const name = [student.first_name, student.last_name].filter(Boolean).join(" ");
  const enrollment = student.current_enrollment;

  return <>
    <header className={`${panelClass} mb-6 p-5 sm:p-6`}>
      <div className="flex flex-col flex-wrap items-start justify-between gap-4 sm:flex-row">
        <div className="flex w-full min-w-0 flex-1 items-start gap-3 sm:w-auto sm:min-w-60">
          <div className="shrink-0"><InitialsAvatar name={name} /></div>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#8B6DF2]">Student profile</p>
            <h1 className="break-words text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{name}</h1>
            <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">Admission no. <span className="font-semibold text-slate-700 dark:text-slate-200">{student.admission_no}</span></p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StudentStatus active={student.is_active} />
          {canEdit && <button type="button" className={`${primaryButtonClass} inline-flex items-center gap-2`} onClick={() => setEditing(true)}><Pencil size={15} />Edit Student</button>}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-white/5 dark:text-slate-300">
        <p className="flex items-center gap-2"><GraduationCap size={16} className="shrink-0 text-slate-400" />{enrollment?.class_name ?? "Class not assigned"}</p>
        <p className="flex items-center gap-2"><Hash size={16} className="shrink-0 text-slate-400" />Roll no. {enrollment?.roll_number ?? "Not assigned"}</p>
        <p className="flex items-center gap-2"><CalendarCheck size={16} className="shrink-0 text-slate-400" />{student.active_session?.name ?? "No active session"}</p>
      </div>
    </header>
    <div role="tablist" aria-label="Student information" className="mb-6 flex overflow-x-auto border-b border-slate-200 dark:border-white/10">
      {tabs.map(({ id, label, icon: Icon }, index) => <button key={id} ref={(element) => { tabButtons.current[index] = element; }} type="button" role="tab" id={`student-tab-${id}`} aria-selected={tab === id} aria-controls={`student-panel-${id}`} tabIndex={tab === id ? 0 : -1}
        onClick={() => setTab(id)} onKeyDown={(event) => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault(); setTab(tabs[next].id); tabButtons.current[next]?.focus();
        }} className={`flex flex-1 shrink-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-semibold sm:text-sm lg:flex-none lg:px-5 ${tab === id ? "border-[#8B6DF2] text-[#8B6DF2]" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}><Icon size={16} className="hidden lg:block" />{label}</button>)}
    </div>
    {tabs.map(({ id }) => <div key={id} role="tabpanel" id={`student-panel-${id}`} aria-labelledby={`student-tab-${id}`} hidden={tab !== id} tabIndex={0}>
      {tab === id && (id === "overview" ? <StudentOverview student={student} /> : id === "fees" ? <StudentFeesTab /> : id === "attendance" ? <StudentAttendanceTab /> : student.active_session ? <StudentResultsTab studentId={studentId} /> : <p className="text-sm text-slate-500 dark:text-slate-400">Activate an academic session to view exam results.</p>)}
    </div>)}
    {editing && <EditStudentDialog studentId={studentId} onClose={() => setEditing(false)} />}
  </>;
}

export default function StudentDetailsPage() {
  const { student_id } = useParams<{ student_id: string }>();
  const id = /^\d+$/.test(student_id) ? Number(student_id) : NaN;
  return <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
    <Link href="/students" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#8B6DF2] dark:text-slate-400"><ArrowLeft size={16} />Back to Students</Link>
    <StudentDetailsContent key={student_id} studentId={id} />
  </div>;
}

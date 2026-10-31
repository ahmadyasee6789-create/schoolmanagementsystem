"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarCheck, FileText, Wallet, type LucideIcon } from "lucide-react";
import { useStudentResults } from "@/app/hooks/useStudents";
import { studentApiError } from "@/app/lib/studentApi";
import { EmptyState } from "@/components/exams/ExamUi";
import StudentResultsList from "@/components/exams/StudentResultsList";
import { panelClass } from "@/components/finance/FinanceUi";
import { secondaryButtonClass } from "./types";
import { StudentError, StudentSkeleton } from "./StudentDetailStates";

function StudentModuleLink({ title, description, icon: Icon, href, action }: { title: string; description: string; icon: LucideIcon; href: string; action: string }) {
  return <section className={`${panelClass} flex flex-col items-start p-5 sm:p-6`}>
    <span className="mb-4 rounded-lg bg-[#8B6DF2]/10 p-2.5 text-[#8B6DF2]"><Icon size={22} /></span>
    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    <Link href={href} className={`${secondaryButtonClass} mt-5 inline-flex items-center gap-2`}>{action}<ArrowUpRight size={15} /></Link>
  </section>;
}

export function StudentFeesTab() {
  return <StudentModuleLink title="Student fee history" icon={Wallet} description="Individual fee history is not available in this profile yet. Open Fee Management to view the class ledger, collect fees and generate vouchers." href="/finance/fee-management" action="Open Fee Management" />;
}

export function StudentAttendanceTab() {
  return <StudentModuleLink title="Student attendance history" icon={CalendarCheck} description="Individual attendance history is not available in this profile yet. Open Attendance to view or mark attendance for a class and date." href="/students/attendances" action="Open Attendance" />;
}

export function StudentResultsTab({ studentId }: { studentId: number }) {
  const query = useStudentResults(studentId);
  if (query.isPending) return <StudentSkeleton />;
  if (query.isError) return <StudentError message={studentApiError(query.error, "Unable to load exam results. Please try again.").message} retry={() => void query.refetch()} />;
  if (!query.data.results.length) return <EmptyState icon={FileText} message="No exam results recorded for this student’s active enrollment." />;
  return <section aria-label="Student exam results" className="space-y-4">
    <p className="text-sm text-slate-500 dark:text-slate-400">Exam results for the current academic session.</p>
    <StudentResultsList results={query.data.results} papers={query.data.papers} />
  </section>;
}

"use client";

import { CircleCheck, CircleX, UserRound } from "lucide-react";
import AttendanceStatusBadge from "./AttendanceStatusBadge";
import type { AttendanceStudent } from "./types";
import { studentName } from "./types";

type AttendanceTableProps = {
  students: AttendanceStudent[];
  showDate?: boolean;
  showTeacher?: boolean;
  onToggle?: (studentId: number) => void;
};

export default function AttendanceTable({ students, showDate = false, showTeacher = false, onToggle }: AttendanceTableProps) {
  const interactive = Boolean(onToggle);
  const headings = ["Roll", "Student", "Status", ...(showDate ? ["Date"] : []), ...(showTeacher ? ["Teacher"] : []), ...(interactive ? ["Toggle"] : [])];

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {students.map((student, index) => {
          const present = student.status === "present";
          return (
            <article key={`${student.id}-${student.date ?? "mark"}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><UserRound size={15} className="text-[#8B6DF2]" /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{studentName(student)}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Roll {student.roll_number || String(index + 1).padStart(3, "0")}</p></div></div></div><AttendanceStatusBadge status={student.status} /></div>
              {(showDate || showTeacher) && <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs dark:border-white/5">{showDate && <div><p className="text-slate-400 dark:text-slate-500">Date</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{student.date || "—"}</p></div>}{showTeacher && <div><p className="text-slate-400 dark:text-slate-500">Teacher</p><p className="mt-1 truncate font-medium text-slate-700 dark:text-slate-200">{student.teacher_name || "—"}</p></div>}</div>}
              {onToggle && <button type="button" onClick={() => onToggle(student.id)} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${present ? "border-red-400/25 text-red-500 hover:bg-red-500/10" : "border-emerald-400/25 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"}`}>{present ? <CircleX size={16} /> : <CircleCheck size={16} />}Mark as {present ? "Absent" : "Present"}</button>}
            </article>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 sm:block">
        <table className="w-full min-w-[620px] border-collapse text-left">
          <thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{headings.map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{heading}</th>)}</tr></thead>
          <tbody>{students.map((student, index) => {
            const present = student.status === "present";
            return <tr key={`${student.id}-${student.date ?? "mark"}`} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{student.roll_number || String(index + 1).padStart(3, "0")}</td><td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100"><span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><UserRound size={15} className="text-[#8B6DF2]" /></span>{studentName(student)}</span></td><td className="px-4 py-3"><AttendanceStatusBadge status={student.status} /></td>{showDate && <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{student.date || "—"}</td>}{showTeacher && <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{student.teacher_name || "—"}</td>}{onToggle && <td className="px-4 py-3"><button type="button" title={`Mark as ${present ? "absent" : "present"}`} onClick={() => onToggle(student.id)} className={`rounded-lg border p-1.5 transition-colors ${present ? "border-red-400/25 bg-red-50 text-red-500 hover:bg-red-500/10 dark:border-red-400/20 dark:bg-red-500/10" : "border-emerald-400/25 bg-emerald-50 text-emerald-600 hover:bg-emerald-500/10 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400"}`}>{present ? <CircleX size={16} /> : <CircleCheck size={16} />}</button></td>}</tr>;
          })}</tbody>
        </table>
      </div>
    </>
  );
}

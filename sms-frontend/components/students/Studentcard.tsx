"use client";

import { Pencil, Trash2, UserRound } from "lucide-react";
import { Student } from "./types";

export default function StudentCard({
  student,
  onEdit,
  onDelete,
}: {
  student: Student;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const parent =
    student.father_name ||
    student.mother_name ||
    student.guardian_name ||
    "No parent recorded";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#8B6DF2]/40 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
              <UserRound size={15} className="text-[#8B6DF2]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
                {student.first_name} {student.last_name}
              </p>
              <p className="mt-0.5 text-xs font-medium text-[#8B6DF2]">
                {student.admission_no}
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            title="Edit student"
            onClick={onEdit}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            title="Delete student"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-500"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-slate-400 dark:text-slate-500">Class</p>
          <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
            {student.grade_name
              ? `${student.grade_name} – ${student.section}`
              : "Not enrolled"}
          </p>
        </div>
        <div>
          <p className="text-slate-400 dark:text-slate-500">Roll no.</p>
          <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
            {student.roll_number || "—"}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-400 dark:text-slate-500">
            Parent / guardian
          </p>
          <p className="mt-1 truncate font-semibold text-slate-700 dark:text-slate-200">
            {parent}
          </p>
        </div>
      </div>
    </article>
  );
}
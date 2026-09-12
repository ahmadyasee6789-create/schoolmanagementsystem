"use client";

import { Pencil, Trash2, Users } from "lucide-react";
import { Student } from "./types";
import StudentCard from "./Studentcard";

const TABLE_HEADINGS = [
  "Adm. No.",
  "Name",
  "Grade / Section",
  "Parent",
  "Contact",
  "Roll No.",
  "Discount",
  "Actions",
];

export default function StudentTable({
  students,
  loading,
  onEdit,
  onDelete,
  onAddFirst,
}: {
  students: Student[];
  loading: boolean;
  onEdit: (student: Student) => void;
  onDelete: (id: number) => void;
  onAddFirst: () => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" />
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10">
        <Users size={32} className="mb-3 text-slate-300 dark:text-slate-600" />
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          No students found
        </p>
        <button
          type="button"
          onClick={onAddFirst}
          className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
        >
          Add your first student
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:hidden">
        {students.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            onEdit={() => onEdit(student)}
            onDelete={() => onDelete(student.id)}
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 sm:block">
        <table className="w-full min-w-[1100px] border-collapse text-left">
          <thead className="bg-slate-50 dark:bg-white/[0.03]">
            <tr>
              {TABLE_HEADINGS.map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr
                key={student.id}
                className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3 text-sm font-semibold text-[#8B6DF2]">
                  {student.admission_no}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {student.first_name} {student.last_name}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  {student.grade_name ? (
                    <span className="rounded-md border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 px-2 py-1 text-xs font-semibold text-[#8B6DF2]">
                      {student.grade_name} – {student.section}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">
                      Not enrolled
                    </span>
                  )}
                </td>
                <td className="max-w-48 truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  {student.father_name ||
                    student.mother_name ||
                    student.guardian_name ||
                    "—"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                  {student.father_phone || student.guardian_phone || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  {student.roll_number || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  {student.discount_percent
                    ? `${student.discount_percent}%`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      title="Edit student"
                      onClick={() => onEdit(student)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      title="Delete student"
                      onClick={() => onDelete(student.id)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
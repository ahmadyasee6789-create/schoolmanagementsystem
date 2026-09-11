"use client";

import { BookOpen, Edit, Trash2 } from "lucide-react";
import type { Subject } from "@/app/(dashboard)/academics/add_subjects/page";

interface SubjectsTableProps {
  subjects: Subject[];
  onEdit: (subject: Subject) => void;
  onDelete: (id: number) => void;
}

export default function SubjectsTable({ subjects, onEdit, onDelete }: SubjectsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-slate-50 dark:bg-white/[0.03]">
            {["#", "Subject Name", "Actions"].map((heading) => (
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
          {subjects.map((subject) => (
            <tr
              key={subject.id}
              className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"
            >
              <td className="w-20 px-4 py-3 font-mono text-sm text-slate-500 dark:text-slate-400">
                {String(subject.id).padStart(3, "0")}
              </td>
              <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
                    <BookOpen size={14} className="text-[#8B6DF2]" />
                  </div>
                  {subject.name}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(subject)}
                    aria-label={`Edit ${subject.name}`}
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-400"
                  >
                    <Edit size={15} />
                  </button>
                  <button
                    onClick={() => onDelete(subject.id)}
                    aria-label={`Delete ${subject.name}`}
                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

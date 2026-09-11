"use client";

import { BookOpen, Edit, Hash, Trash2 } from "lucide-react";
import type { Subject } from "@/app/(dashboard)/academics/add_subjects/page";

interface SubjectCardProps {
  subject: Subject;
  onEdit: () => void;
  onDelete: () => void;
}

export default function SubjectCard({ subject, onEdit, onDelete }: SubjectCardProps) {
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#8B6DF2]/40 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
            <BookOpen size={15} className="text-[#8B6DF2]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
              {subject.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Hash size={11} />
              Subject {String(subject.id).padStart(3, "0")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onEdit}
            aria-label={`Edit ${subject.name}`}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-400"
          >
            <Edit size={15} />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Delete ${subject.name}`}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { BookOpen, Calendar, Edit, Trash2 } from "lucide-react";

interface TermCardProps {
  term: {
    id: number;
    name: string;
    academic_year_id: number;
    academic_year?: { id: number; name: string };
    exams?: any[];
  };
  onEdit: () => void;
  onDelete: () => void;
}

export default function TermCard({ term, onEdit, onDelete }: TermCardProps) {
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#8B6DF2]/40 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1 pr-2">
          <div className="mb-1.5 flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
              <BookOpen size={14} className="text-[#8B6DF2]" />
            </div>
            <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
              {term.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <Calendar size={12} />
            <span className="text-xs">
              {term.academic_year?.name ?? `Session #${term.academic_year_id}`}
            </span>
          </div>
          {(term.exams?.length ?? 0) > 0 && (
            <span className="mt-2 inline-block rounded-md border border-blue-400/25 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400">
              {term.exams?.length} exams
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-400"
          >
            <Edit size={15} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
"use client";
import React from "react";
import { BookOpen, Calendar, Edit, Trash2 } from "lucide-react";

type Term = {
  id: number;
  name: string;
  academic_year_id: number;
  academic_year?: { id: number; name: string };
  exams?: any[];
};

interface TermsTableProps {
  grouped: Record<string, { sessionName: string; terms: Term[] }>;
  onEdit: (term: Term) => void;
  onDelete: (id: number) => void;
}

export default function TermsTable({ grouped, onEdit, onDelete }: TermsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-slate-50 dark:bg-white/[0.03]">
            {["Term Name", "Academic Session", "Exams", "Actions"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([key, group]) => (
            
            <React.Fragment key={key}>
              <tr key={`group-${key}`} className="bg-slate-50/60 dark:bg-white/[0.02]">
                <td colSpan={4} className="px-4 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <Calendar size={13} />
                    {group.sessionName}
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {group.terms.length}
                    </span>
                  </div>
                </td>
              </tr>
              {group.terms.map((term) => (
                <tr
                  key={term.id}
                  className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
                        <BookOpen size={14} className="text-[#8B6DF2]" />
                      </div>
                      {term.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    {term.academic_year?.name ?? `Session #${term.academic_year_id}`}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(term.exams?.length ?? 0) > 0 ? (
                      <span className="rounded-md border border-blue-400/25 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400">
                        {term.exams?.length} exams
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onEdit(term)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-400"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => onDelete(term.id)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
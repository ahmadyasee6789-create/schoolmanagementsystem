"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Employee, formatDate } from "./types.ts";
import { RoleBadge, SourceBadge, StatusBadge } from "./Badges";

export default function EmployeeCard({
  emp,
  onEdit,
  onDelete,
}: {
  emp: Employee;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isMember = emp.source === "member";

  return (
    <article className="mb-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#8B6DF2]/40 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
            {emp.full_name}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {emp.email || "—"}
          </p>
        </div>
        <StatusBadge status={emp.status} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <RoleBadge role={emp.role} />
        <SourceBadge source={emp.source} />
      </div>

      <div className="mb-3 flex gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Phone
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-600 dark:text-slate-300">
            {emp.phone || "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Joined
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-600 dark:text-slate-300">
            {formatDate(emp.joining_date)}
          </p>
        </div>
      </div>

      {isMember ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Via invitation</p>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded-md border border-[#8B6DF2]/30 px-2.5 py-1 text-xs font-semibold text-[#8B6DF2] transition-colors hover:bg-[#8B6DF2]/10"
          >
            <Pencil size={13} />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded-md border border-red-400/30 px-2.5 py-1 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
"use client";

import { Plus, Search, Upload } from "lucide-react";
import { Grade, inputClass } from "./types";

export default function StudentToolbar({
  search,
  onSearchChange,
  gradeFilter,
  onGradeFilterChange,
  grades,
  importing,
  onImportFile,
  onAdd,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  gradeFilter: string | "all";
  onGradeFilterChange: (value: string) => void;
  grades: Grade[];
  importing: boolean;
  onImportFile: (file: File) => void;
  onAdd: () => void;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">
            Students
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage student records, enrolments and information
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
            <Upload size={16} />
            {importing ? "Importing…" : "Import Students"}
            <input
              hidden
              type="file"
              accept=".xlsx,.csv"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportFile(file);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
          >
            <Plus size={16} />
            Add Student
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-12">
        <div className="relative md:col-span-7">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by name or admission no…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(event) => onGradeFilterChange(event.target.value)}
          className={`${inputClass} md:col-span-5`}
        >
          <option value="all">All Grades</option>
          {grades.map((grade) => (
            <option key={grade.id} value={grade.name}>
              {grade.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
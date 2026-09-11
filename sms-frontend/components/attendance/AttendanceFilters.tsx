"use client";

import { CalendarDays, ChartBar, GraduationCap, Search } from "lucide-react";
import type { Classroom } from "./types";
import { classLabel } from "./types";

type AttendanceFiltersProps = {
  classes: Classroom[];
  classId: number | "";
  date: string;
  onClassChange: (classId: number) => void;
  onDateChange: (date: string) => void;
  search?: string;
  onSearchChange?: (search: string) => void;
  onGenerate?: () => void;
  generating?: boolean;
};

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100";

export default function AttendanceFilters({
  classes,
  classId,
  date,
  onClassChange,
  onDateChange,
  search,
  onSearchChange,
  onGenerate,
  generating = false,
}: AttendanceFiltersProps) {
  const isReport = Boolean(onGenerate);

  return (
    <div className={`mb-6 grid gap-3 ${isReport ? "sm:grid-cols-3" : "sm:grid-cols-12"}`}>
      <label className={isReport ? "block" : "block sm:col-span-5"}>
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><GraduationCap size={14} className="text-[#8B6DF2]" />Class</span>
        <select value={classId} onChange={(event) => onClassChange(Number(event.target.value))} className={inputClass}>
          <option value="" disabled>Select class</option>
          {classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classLabel(classroom)}</option>)}
        </select>
      </label>
      <label className={isReport ? "block" : "block sm:col-span-4"}>
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"><CalendarDays size={14} className="text-[#8B6DF2]" />Date</span>
        <input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className={inputClass} />
      </label>
      {isReport ? (
        <div className="flex items-end"><button type="button" onClick={onGenerate} disabled={generating || !classId} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"><ChartBar size={16} />{generating ? "Loading…" : "Generate Report"}</button></div>
      ) : (
        <label className="relative block sm:col-span-3">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Search</span>
          <Search size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400 dark:text-slate-500" />
          <input value={search} onChange={(event) => onSearchChange?.(event.target.value)} placeholder="Search students…" className={`${inputClass} pl-9`} />
        </label>
      )}
    </div>
  );
}

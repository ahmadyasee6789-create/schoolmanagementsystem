"use client";

export function gradeClass(grade: string | null) {
  if (!grade) return "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  if (["A+", "A", "A1"].includes(grade.toUpperCase())) return "border-emerald-400/25 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400";
  if (["B+", "B", "B1"].includes(grade.toUpperCase())) return "border-blue-400/25 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400";
  if (["C+", "C", "C1"].includes(grade.toUpperCase())) return "border-amber-400/25 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-400";
  if (["D", "D1"].includes(grade.toUpperCase())) return "border-violet-400/25 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-400";
  return "border-red-400/25 bg-red-50 text-red-500 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400";
}

export function GradeBadge({ grade }: { grade: string | null }) {
  return grade ? <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${gradeClass(grade)}`}>{grade}</span> : <span className="text-sm text-slate-400 dark:text-slate-500">—</span>;
}

export function ScoreBar({ obtained, total, pass }: { obtained: number; total: number; pass: number }) {
  const percentage = total > 0 ? Math.round((obtained / total) * 100) : 0;
  const passed = obtained >= pass;
  return <div className="min-w-28"><div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="font-bold text-slate-700 dark:text-slate-200">{obtained}/{total}</span><span className={passed ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-red-500"}>{percentage}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className={`h-full rounded-full ${passed ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, percentage)}%` }} /></div></div>;
}

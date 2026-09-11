"use client";

import type { LucideIcon } from "lucide-react";

export default function AttendanceEmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10">
      <Icon size={32} className="mb-3 text-slate-300 dark:text-slate-600" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

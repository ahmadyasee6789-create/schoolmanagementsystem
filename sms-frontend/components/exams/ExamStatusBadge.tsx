"use client";

import { FileClock, Lock, Send } from "lucide-react";
import type { Exam } from "./types";
import { examStatus } from "./types";

export default function ExamStatusBadge({ exam }: { exam: Exam }) {
  const status = examStatus(exam);
  const config = {
    draft: { label: "Draft", Icon: FileClock, className: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400" },
    published: { label: "Published", Icon: Send, className: "border-emerald-400/25 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" },
    locked: { label: "Locked", Icon: Lock, className: "border-red-400/25 bg-red-50 text-red-500 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400" },
  }[status];
  const { Icon } = config;

  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${config.className}`}><Icon size={13} />{config.label}</span>;
}

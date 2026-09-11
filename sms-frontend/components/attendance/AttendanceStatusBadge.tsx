"use client";

import { CircleCheck, CircleX } from "lucide-react";
import type { AttendanceStatus } from "./types";

export default function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const present = status === "present";
  const Icon = present ? CircleCheck : CircleX;

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${present ? "border-emerald-400/25 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-red-400/25 bg-red-50 text-red-500 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400"}`}>
      <Icon size={13} />
      {present ? "Present" : "Absent"}
    </span>
  );
}

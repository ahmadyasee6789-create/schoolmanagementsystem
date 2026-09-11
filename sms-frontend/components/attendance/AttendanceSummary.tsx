"use client";

type AttendanceSummaryProps = {
  present: number;
  absent: number;
  total?: number;
};

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${tone}`}>
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

export default function AttendanceSummary({ present, absent, total }: AttendanceSummaryProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <SummaryPill label="Present" value={present} tone="border-emerald-400/25 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" />
      <SummaryPill label="Absent" value={absent} tone="border-red-400/25 bg-red-50 text-red-500 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400" />
      {total !== undefined && <SummaryPill label="Total" value={total} tone="border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" />}
    </div>
  );
}

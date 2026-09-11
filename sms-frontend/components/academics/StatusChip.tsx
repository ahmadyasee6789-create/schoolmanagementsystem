import { CheckCircle, Circle } from "lucide-react";

export default function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[0.7rem] font-semibold ${
        active
          ? "border-green-500/30 bg-green-50 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
          : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400"
      }`}
    >
      {active ? <CheckCircle size={13} /> : <Circle size={13} />}
      {active ? "Active" : "Inactive"}
    </span>
  );
}
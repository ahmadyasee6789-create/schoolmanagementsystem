import { fmt } from "./CustomTooltip";

interface FinSummaryRowProps {
  label: string;
  value: number;
  colorHex: string;
  border?: boolean;
}

export default function FinSummaryRow({ label, value, colorHex, border = false }: FinSummaryRowProps) {
  return (
    <div
      className={`flex items-center justify-between py-[11px] ${
        border ? "border-t border-slate-200 dark:border-white/10" : ""
      }`}
    >
      <span className="text-[0.82rem] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-mono text-[0.88rem] font-bold" style={{ color: colorHex }}>
        {fmt(value)}
      </span>
    </div>
  );
}
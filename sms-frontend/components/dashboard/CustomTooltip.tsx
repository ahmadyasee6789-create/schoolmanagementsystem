const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (n: number) =>
  n >= 1_000_000 ? `Rs ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `Rs ${(n / 1_000).toFixed(0)}k`
  : `Rs ${n}`;

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly { name?: string; dataKey?: string | number; value?: number | string; color?: string }[];
}

export default function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const countKeys = ["students", "classes", "faculty"];
  const countNames = ["Active", "Inactive", "Present", "Absent", "Leave", "Not Marked", "Late", "Other"];

  return (
    <div className="min-w-[160px] rounded-[10px] border border-line bg-dialog p-3.5 shadow-[var(--shadow)]">
      {label && (
        <p className="mb-2 text-[0.7rem] uppercase tracking-wider text-secondary">
          {typeof label === "number" ? MONTHS_SHORT[label - 1] : label}
        </p>
      )}
      {payload.map((p, i: number) => (
        <div key={i} className="mb-1 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-secondary">{p.name}</span>
          </div>
          <span className="text-[0.78rem] font-bold text-foreground">
            {countKeys.includes(String(p.dataKey)) || countNames.includes(String(p.name)) ? p.value : fmt(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

export { fmt, MONTHS_SHORT };
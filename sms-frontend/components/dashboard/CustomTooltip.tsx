const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt = (n: number) =>
  n >= 1_000_000 ? `Rs ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `Rs ${(n / 1_000).toFixed(0)}k`
  : `Rs ${n}`;

export default function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const countKeys = ["students", "classes", "faculty"];
  const countNames = ["Active", "Inactive"];

  return (
    <div className="min-w-[160px] rounded-[10px] border border-slate-200 bg-white p-3.5 shadow-lg dark:border-white/10 dark:bg-[#1C2535] dark:shadow-black/50">
      {label && (
        <p className="mb-2 text-[0.7rem] uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {typeof label === "number" ? MONTHS_SHORT[label - 1] : label}
        </p>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} className="mb-1 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-slate-500 dark:text-slate-400">{p.name}</span>
          </div>
          <span className="text-[0.78rem] font-bold text-slate-900 dark:text-slate-50">
            {countKeys.includes(p.dataKey) || countNames.includes(p.name) ? p.value : fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export { fmt, MONTHS_SHORT };
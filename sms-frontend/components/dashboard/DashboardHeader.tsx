interface DashboardHeaderProps {
  year: number | string;
  subtitle: string;
}

export default function DashboardHeader({ year, subtitle }: DashboardHeaderProps) {
  return (
    <div className="mb-7" style={{ animation: "fadeUp 0.4s ease both" }}>
      <div className="mb-1 flex items-center gap-3">
        <span className="h-6 w-[3px] rounded-sm bg-[#8B6DF2] " />
        <h1 className="text-[1.45rem] font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Dashboard
        </h1>
      </div>
      <p className="ml-[19px] text-[0.82rem] text-slate-500 dark:text-slate-400">
        {year} · {subtitle}
      </p>
    </div>
  );
}
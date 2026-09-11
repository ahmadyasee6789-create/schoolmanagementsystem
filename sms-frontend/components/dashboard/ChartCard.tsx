interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export default function ChartCard({ title, subtitle, children, action }: ChartCardProps) {
  return (
    <div className="h-full rounded-[14px] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#161D2B]">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-[0.92rem] font-bold text-slate-900 dark:text-slate-50">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-[0.72rem] text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="my-4 border-t border-slate-200 dark:border-white/10" />
      {children}
    </div>
  );
}
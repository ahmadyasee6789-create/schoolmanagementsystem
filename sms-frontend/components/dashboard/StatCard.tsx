interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  colorHex: string;
  dimBgClass: string;
  sub?: string;
  change?: string;
  delay?: number;
}

export default function StatCard({
  title, value, icon: Icon, colorHex, dimBgClass, sub, change, delay = 0,
}: StatCardProps) {
  const positive = change?.startsWith("▲");

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-[2px] hover:shadow-lg dark:border-white/10 dark:bg-[#161D2B] dark:shadow-none dark:hover:shadow-xl dark:hover:shadow-black/30"
      style={{ animation: "fadeUp 0.5s ease both", animationDelay: `${delay}ms` }}
    >
      <div
        className="absolute left-0 right-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${colorHex}, transparent)` }}
      />

      <div className="mb-2.5 flex items-start justify-between">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-[9px] border ${dimBgClass}`}
          style={{ borderColor: `${colorHex}25` }}
        >
          <Icon size={16} style={{ color: colorHex }} />
        </div>
      </div>

      <p className="mb-0.5 text-[0.62rem] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </p>
      <h2 className="text-[1.15rem] font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
        {value}
      </h2>

      {sub && (
        <p className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">{sub}</p>
      )}

     
    </div>
  );
}
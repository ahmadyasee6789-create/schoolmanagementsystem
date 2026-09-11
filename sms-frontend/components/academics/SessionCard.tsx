import { Calendar, Play } from "lucide-react";
import StatusChip from "./StatusChip";
import { fmtDate } from "./fmtdate";

interface Session {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export default function SessionCard({
  session,
  onActivate,
}: {
  session: Session;
  onActivate: () => void;
}) {
  return (
    <div
      className={`mb-3 rounded-xl border bg-white p-4 transition-colors dark:bg-[#161D2B] ${
        session.is_active
          ? "border-green-500/40 dark:border-green-400/40"
          : "border-slate-200 hover:border-amber-400/40 dark:border-white/10 dark:hover:border-amber-400/25"
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${
              session.is_active
                ? "border-green-500/25 bg-green-50 dark:border-green-400/25 dark:bg-green-400/10"
                : "border-amber-400/20 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10"
            }`}
          >
            <Calendar
              size={17}
              className={session.is_active ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}
            />
          </div>
          <div>
            <p className="text-[0.925rem] font-bold leading-tight text-slate-900 dark:text-slate-50">
              {session.name}
            </p>
            <div className="mt-1">
              <StatusChip active={session.is_active} />
            </div>
          </div>
        </div>

        {!session.is_active && (
          <button
            onClick={onActivate}
            className="flex items-center gap-1 rounded-[7px] border border-amber-400/30 px-2.5 py-1 text-[0.72rem] font-semibold text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-400/10"
          >
            <Play size={13} />
            Activate
          </button>
        )}
      </div>

      <div className="mt-1 flex gap-6">
        {[
          { label: "Start", value: fmtDate(session.start_date) },
          { label: "End", value: fmtDate(session.end_date) },
        ].map((d) => (
          <div key={d.label}>
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {d.label}
            </p>
            <p className="font-mono text-[0.78rem] font-medium text-slate-900 dark:text-slate-100">
              {d.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
import { Calendar, CalendarClock, Play } from "lucide-react";
import StatusChip from "./StatusChip";
import { fmtDate } from "./fmtdate";

interface Session {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export default function SessionsTable({
  sessions,
  onActivate,
}: {
  sessions: Session[];
  onActivate: (id: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#161D2B]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-white/10">
            {["Session", "Start Date", "End Date", "Status", "Actions"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left font-mono text-[0.68rem] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr
            key={s.id}
            className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border ${
                      s.is_active
                      ? "border-green-500/25 bg-green-50 dark:border-green-400/25 dark:bg-green-400/10"
                      : "border-amber-400/20 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10"
                    }`}
                    >
                    <Calendar
                      size={15}
                      className={s.is_active ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}
                      />
                  </div>
                  <span className="text-[0.875rem] font-bold text-slate-900 dark:text-slate-50">{s.name}</span>
                </div>
              </td>
                      

              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <CalendarClock size={13} className="text-slate-400 dark:text-slate-500" />
                  <span className="font-mono text-[0.8rem] text-slate-700 dark:text-slate-200">
                    {fmtDate(s.start_date)}
                  </span>
                </div>
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <CalendarClock size={13} className="text-slate-400 dark:text-slate-500" />
                  <span className="font-mono text-[0.8rem] text-slate-700 dark:text-slate-200">
                    {fmtDate(s.end_date)}
                  </span>
                </div>
              </td>

              <td className="px-4 py-3">
                <StatusChip active={s.is_active} />
              </td>

              <td className="px-4 py-3">
                {!s.is_active ? (
                  <button
                    onClick={() => onActivate(s.id)}
                    title="Set as active session"
                    className="flex items-center gap-1 rounded-lg border border-amber-400/30 px-2.5 py-1 text-[0.72rem] font-semibold text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-400/10"
                  >
                    <Play size={13} />
                    Activate
                  </button>
                ) : (
                  <span className="text-[0.75rem] italic text-green-600 dark:text-green-400">
                    Current session
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import ChartCard from "./ChartCard";
import CustomTooltip from "./CustomTooltip";

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  leave: number;
  not_marked: number;
  late: number;
  other: number;
  percentage: number;
  marked: boolean;
  date: string;
  timezone: string;
  is_school_day: boolean | null;
  calendar_configured: boolean;
}

export default function AttendanceChart({ summary }: { summary?: AttendanceSummary }) {
  const available = summary && [summary.total, summary.present, summary.absent, summary.leave,
    summary.not_marked, summary.late, summary.other, summary.percentage].every(Number.isFinite);
  if (!available) return <ChartCard title="Today's Attendance" subtitle="Present, absent, leave and not marked">
    <p role="status" className="flex h-[240px] items-center justify-center text-sm text-secondary">
      Attendance summary unavailable. Refresh after the backend is updated.
    </p>
  </ChartCard>;
  const total = summary.total;
  const presentPercentage = new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(summary.percentage);
  const data = [
    { name: "Present", value: summary.present, color: "var(--success)" },
    { name: "Absent", value: summary.absent, color: "var(--danger)" },
    { name: "Leave", value: summary.leave, color: "var(--warning)" },
    { name: "Not Marked", value: summary.not_marked, color: "var(--text-muted)" },
    ...(summary.late ? [{ name: "Late", value: summary.late, color: "var(--info)" }] : []),
    ...(summary.other ? [{ name: "Other", value: summary.other, color: "var(--accent)" }] : []),
  ];

  return (
    <ChartCard
      title="Today's Attendance"
      subtitle={`${summary.date} · ${summary.timezone}`}
    >
      {summary.is_school_day === false && <p role="status" className="mb-3 rounded-lg bg-muted p-2 text-xs text-secondary">
        No school scheduled today. Any recorded attendance is shown below.
      </p>}
      {summary.is_school_day !== false && !summary.marked && total > 0 && <p role="status" className="mb-3 text-xs text-secondary">
        Attendance has not been marked today.{!summary.calendar_configured && " School calendar not configured."}
      </p>}
      <div className="relative h-[240px]">
        {total > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.filter((item) => item.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data
                    .filter((item) => item.value > 0)
                    .map((item) => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 10 }} />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {presentPercentage}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Present
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            No eligible students
          </div>
        )}
      </div>

      <div aria-label="Today's attendance counts" className="grid grid-cols-2 gap-3">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {item.name}: {item.value}
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

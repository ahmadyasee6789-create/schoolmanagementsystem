"use client";

import { useTheme } from "@/app/context/ThemeContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ChartCard from "./ChartCard";
import CustomTooltip, { MONTHS_SHORT } from "./CustomTooltip";

interface MonthlyFinancialChartProps {
  data: { month: number; Revenue: number; Salary: number; Expense: number; Net: number }[];
  year: number | string;
}

export default function MonthlyFinancialChart({ data, year }: MonthlyFinancialChartProps) {
  const { mode } = useTheme();
  const gridColor = mode === "dark" ? "rgba(255,255,255,0.07)" : "#E5E7EB";
  const axisStyle = {
    fill: mode === "dark" ? "rgba(249,250,251,0.3)" : "#94A3B8",
    fontSize: 11,
  };

  return (
    <ChartCard
      title="Monthly Financial Overview"
      subtitle={`${year} — Revenue, salaries, expenses and net profit`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart key={mode} data={data} barSize={14} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="month"
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => MONTHS_SHORT[v - 1]}
          />
          <YAxis
            tick={axisStyle}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(128,128,128,0.05)" }} />
          <Legend
            iconType="circle"
            iconSize={7}
            formatter={(v) => (
              <span className="text-[0.75rem] text-slate-500 dark:text-slate-400">{v}</span>
            )}
          />
          <Bar dataKey="Revenue" fill="#34D399" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Expense" fill="#F87171" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Salary" fill="#A78BFA" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Net" fill="#F59E0B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

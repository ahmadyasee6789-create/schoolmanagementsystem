"use client";

import { useTheme } from "@/app/context/ThemeContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import ChartCard from "./ChartCard";
import CustomTooltip from "./CustomTooltip";

interface StudentsPerClassChartProps {
  data: { class: string; students: number }[];
  fullWidth?: boolean;
}

export default function StudentsPerClassChart({ data }: StudentsPerClassChartProps) {
  const { mode } = useTheme();
  const gridColor = "var(--border)";
  const axisStyle = {
    fill: "var(--text-muted)",
    fontSize: 11,
  };

  return (
    <ChartCard title="Students Per Class" subtitle="Enrolment breakdown by grade">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart key={mode} data={data} barSize={26}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="class" tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(128,128,128,0.06)" }} />
          <Bar
            dataKey="students"
            fill="#8B6DF2"
            radius={[5, 5, 0, 0]}
            background={{ fill: "rgba(128,128,128,0.04)", radius: 5 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

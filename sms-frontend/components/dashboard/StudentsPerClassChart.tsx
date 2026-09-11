"use client";

import { useTheme } from "@/app/context/ThemeContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import ChartCard from "./ChartCard";
import CustomTooltip from "./CustomTooltip";

interface StudentsPerClassChartProps {
  data: { class: string; students: number }[];
  fullWidth?: boolean;
}

export default function StudentsPerClassChart({ data, fullWidth = false }: StudentsPerClassChartProps) {
  const { mode } = useTheme();
  const gridColor = mode === "dark" ? "rgba(255,255,255,0.07)" : "#E5E7EB";
  const axisStyle = {
    fill: mode === "dark" ? "rgba(249,250,251,0.3)" : "#94A3B8",
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
            fill="#F59E0B"
            radius={[5, 5, 0, 0]}
            background={{ fill: "rgba(128,128,128,0.04)", radius: 5 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

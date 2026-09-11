import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ChartCard from "./ChartCard";
import CustomTooltip from "./CustomTooltip";

interface StudentStatusChartProps {
  active: number;
  inactive: number;
}

export default function StudentStatusChart({ active, inactive }: StudentStatusChartProps) {
  const pieData = [
    { name: "Active", value: active },
    { name: "Inactive", value: inactive },
  ];
  const colors = ["#F59E0B", "#60A5FA"];

  return (
    <ChartCard title="Student Status" subtitle="Active vs inactive enrolment">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            outerRadius={88}
            innerRadius={54}
            paddingAngle={4}
            strokeWidth={0}
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={colors[i]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={7}
            formatter={(v) => (
              <span className="text-[0.75rem] text-slate-500 dark:text-slate-400">{v}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
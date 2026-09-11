import ChartCard from "./ChartCard";
import FinSummaryRow from "./FinSummaryRow";
import { fmt } from "./CustomTooltip";

interface YearSummaryCardProps {
  year: number | string;
  revenue: number;
  expenses: number;
  salaries: number;
  totalOutflow: number;
  netProfit: number;
  pendingPayroll?: number;
}

export default function YearSummaryCard({
  year, revenue, expenses, salaries, totalOutflow, netProfit, pendingPayroll = 0,
}: YearSummaryCardProps) {
  const netColor = netProfit >= 0 ? "#34D399" : "#F87171";

  return (
    <ChartCard title="Year Summary" subtitle={`Full ${year} financial breakdown`}>
      <div className="pt-1">
        <FinSummaryRow label="Fee Revenue" value={revenue} colorHex="#34D399" />
        <FinSummaryRow label="Operational Expenses" value={expenses} colorHex="#F87171" />
        <FinSummaryRow label="Salaries Paid" value={salaries} colorHex="#A78BFA" />
        <FinSummaryRow label="Total Outflow" value={totalOutflow} colorHex="#F87171" />

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-[0.9rem] font-bold text-slate-900 dark:text-slate-50">
              Net Profit
            </span>
            <span className="font-mono text-[1.05rem] font-bold" style={{ color: netColor }}>
              {fmt(netProfit)}
            </span>
          </div>

          {pendingPayroll > 0 && (
            <div className="mt-4 rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/10 p-3">
              <p className="text-[0.72rem] font-semibold text-[#F59E0B]">
                ⚠ Pending payroll: {fmt(pendingPayroll)} not yet disbursed
              </p>
            </div>
          )}
        </div>
      </div>
    </ChartCard>
  );
}
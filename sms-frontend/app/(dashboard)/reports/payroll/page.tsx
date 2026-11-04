'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banknote, Clock, TrendingUp, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { Badge } from '@/components/finance/FinanceUi';
import {
  ReportFilterSelect, ReportFilters, ReportPage, ReportPayment, ReportPaymentStatus, ReportPerson, ReportTable,
} from '@/components/reports/ReportUi';

type PayrollRow = {
  id: number; member_name: string; role: string;
  basic_salary: number; allowances: number; deductions: number;
  net_salary: number; month: string; status: 'paid' | 'unpaid' | 'partial';
  paid_amount: number;
};
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function PayrollReport() {
  const [rows, setRows]               = useState<PayrollRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [monthFilter, setMonthFilter]   = useState(MONTHS[new Date().getMonth()]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter]     = useState('all');



  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (monthFilter)            params.month  = monthFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (roleFilter !== 'all')   params.role   = roleFilter;
      const res = await api.get('/reports/payroll', { params });
      setRows(Array.isArray(res.data) ? res.data : res.data?.items ?? []);
    } catch { toast.error('Failed to load payroll report'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [monthFilter, statusFilter, roleFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const totalPayable = rows.reduce((s, r) => s + r.net_salary,   0);
  const totalPaid    = rows.reduce((s, r) => s + r.paid_amount,  0);
  const totalPending = totalPayable - totalPaid;
  const paidCount    = rows.filter(r => r.status === 'paid').length;
  const roles        = [...new Set(rows.map(r => r.role))];
  const disbursement = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}.paid{color:#059669;font-weight:600}.unpaid{color:#dc2626;font-weight:600}.partial{color:#d97706;font-weight:600}</style>`;
    const body = `<h1>Payroll Report — ${monthFilter}</h1><p>Generated ${new Date().toLocaleDateString()} · ${rows.length} staff members</p><div class="stats"><div class="stat"><div class="stat-label">Total Payable</div><div class="stat-val">₨${totalPayable.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Paid Out</div><div class="stat-val" style="color:#059669">₨${totalPaid.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Pending</div><div class="stat-val" style="color:#dc2626">₨${totalPending.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Disbursed</div><div class="stat-val">${disbursement}%</div></div></div><table><thead><tr><th>#</th><th>Name</th><th>Role</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>Net Salary</th><th>Paid</th><th>Status</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.member_name}</td><td>${r.role}</td><td>₨${r.basic_salary.toLocaleString()}</td><td style="color:#059669">+₨${r.allowances.toLocaleString()}</td><td style="color:#dc2626">-₨${r.deductions.toLocaleString()}</td><td style="font-weight:700">₨${r.net_salary.toLocaleString()}</td><td>₨${r.paid_amount.toLocaleString()}</td><td class="${r.status}">${r.status.charAt(0).toUpperCase()+r.status.slice(1)}</td></tr>`).join('')}</tbody></table>`;
    const win = window.open('','_blank'); if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Payroll Report</title>${style}</head><body>${body}</body></html>`);
    win.document.close(); win.print();
  };

  return (
    <ReportPage
      title="Payroll Report"
      subtitle="Staff salary breakdown · payment status · monthly disbursement"
      onRefresh={() => fetchData(true)}
      onExport={exportPDF}
      refreshing={refreshing}
      stats={[
        { title: 'Total Payable', value: `₨${totalPayable.toLocaleString()}`, icon: Wallet, tone: 'purple', sub: `${rows.length} staff` },
        { title: 'Disbursed', value: `₨${totalPaid.toLocaleString()}`, icon: Banknote, tone: 'green', sub: `${paidCount} paid` },
        { title: 'Outstanding', value: `₨${totalPending.toLocaleString()}`, icon: Clock, tone: 'red', sub: `${rows.length - paidCount} unpaid` },
        { title: 'Disbursement %', value: `${disbursement}%`, icon: TrendingUp, tone: 'blue' },
      ]}
    >
      <ReportFilters count={rows.length}>
        <ReportFilterSelect label="Month" value={monthFilter} onChange={setMonthFilter} options={MONTHS.map(m => ({ value: m, label: m }))} />
        <ReportFilterSelect label="Role" value={roleFilter} onChange={setRoleFilter}
          options={[{ value: 'all', label: 'All Roles' }, ...roles.map(r => ({ value: r, label: r }))]} />
        <ReportFilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}
          options={[{ value: 'all', label: 'All Statuses' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partial' }]} />
      </ReportFilters>

      <ReportTable label="Payroll records" personColumn="Staff Member"
        columns={['Role', 'Basic', 'Allowances', 'Deductions', 'Net Salary', 'Payment', 'Status']}
        loading={loading} icon={Wallet} empty="No payroll records found"
        rows={rows.map((row) => ({
          key: row.id,
          person: <ReportPerson name={row.member_name} />,
          values: [
            <Badge key="role">{row.role}</Badge>,
            `₨${row.basic_salary.toLocaleString()}`,
            <span key="allowances" className="text-emerald-600 dark:text-emerald-400">+₨{row.allowances.toLocaleString()}</span>,
            <span key="deductions" className="text-red-600 dark:text-red-400">−₨{row.deductions.toLocaleString()}</span>,
            <strong key="net" className="font-semibold text-slate-900 dark:text-slate-100">₨{row.net_salary.toLocaleString()}</strong>,
            <ReportPayment key="payment" paid={row.paid_amount} total={row.net_salary} />,
            <ReportPaymentStatus key="status" status={row.status} />,
          ],
        }))}
      />
    </ReportPage>
  );
}

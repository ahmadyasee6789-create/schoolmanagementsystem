'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, Clock, ReceiptText, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { useReportSession } from '@/components/reports/useReportSession';
import { printReport, escapeHtml } from '@/components/reports/reportExport';
import {
  ReportClass, ReportFilterSelect, ReportFilters, ReportPage, ReportPayment, ReportPaymentStatus, ReportPerson, ReportTable,
} from '@/components/reports/ReportUi';

type FeeRecord = {
  id: number; student_name: string; admission_no: string;
  grade_name: string; section: string; month: string;
  total_amount: number; discount_amount: number; final_amount: number;
  paid_amount: number; status: 'paid' | 'unpaid' | 'partial';
};
type Grade = { id: number; name: string };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function FeeReport() {
  const { sessionId, setSessionId, sessions, sessionError } = useReportSession();
  const [reportError, setReportError] = useState('');
  const requestId = useRef(0);
  const cancelRequest = useCallback(() => { requestId.current++; }, []);
  const [totals, setTotals] = useState({ total_billed: 0, total_paid: 0, total_pending: 0, session_cash_received: 0, session_advance_credit: 0 });
  const [records, setRecords]           = useState<FeeRecord[]>([]);
  const [grades, setGrades]             = useState<Grade[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [gradeFilter, setGradeFilter]   = useState('all');
  const [monthFilter, setMonthFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    void api.get('/grades').then(r => setGrades(r.data)).catch(() => {});
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!sessionId) return;
    const request = ++requestId.current;
    setReportError('');
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params: Record<string, string> = { session_id: sessionId };
      if (gradeFilter !== 'all')  params.grade_name = gradeFilter;
      if (monthFilter !== 'all')  params.month      = monthFilter;
      if (statusFilter !== 'all') params.status     = statusFilter;

      const res = await api.get('/reports/fees', { params });
      if (request !== requestId.current) return;
      setRecords(res.data.items ?? []);
      setTotals(res.data);
    } catch { if (request !== requestId.current) return; setReportError('Could not load this report. Check your permissions and filters, then press Refresh to retry.'); setRecords([]); setTotals({ total_billed: 0, total_paid: 0, total_pending: 0, session_cash_received: 0, session_advance_credit: 0 }); toast.error('Failed to load fee report'); }
    finally { if (request === requestId.current) { setLoading(false); setRefreshing(false); } }
  }, [sessionId, gradeFilter, monthFilter, statusFilter]);

  useEffect(() => { void fetchData(); return cancelRequest; }, [fetchData, cancelRequest]);
  const totalBilled = totals.total_billed;
  const totalPaid = totals.total_paid;
  const totalPending = totals.total_pending;
  const paidCount    = records.filter(r => r.status === 'paid').length;
  const unpaidCount  = records.filter(r => r.status === 'unpaid').length;
  const recoveryRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}.paid{color:#059669;font-weight:600}.unpaid{color:#dc2626;font-weight:600}.partial{color:#d97706;font-weight:600}</style>`;
    const body = `<h1>Fee Report</h1><p>Session cash: ${totals.session_cash_received.toLocaleString()} - Session advance credit: ${totals.session_advance_credit.toLocaleString()}</p><p>Generated ${new Date().toLocaleDateString('en-PK',{dateStyle:'long'})} · ${records.length} records</p><div class="stats"><div class="stat"><div class="stat-label">Total Billed</div><div class="stat-val">₨${totalBilled.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Applied to Fees</div><div class="stat-val" style="color:#059669">₨${totalPaid.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Pending</div><div class="stat-val" style="color:#dc2626">₨${totalPending.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Recovery</div><div class="stat-val">${recoveryRate}%</div></div></div><table><thead><tr><th>#</th><th>Student</th><th>Adm No.</th><th>Grade</th><th>Month</th><th>Total</th><th>Discount</th><th>Final</th><th>Paid</th><th>Status</th></tr></thead><tbody>${records.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.student_name)}</td><td>${escapeHtml(r.admission_no)}</td><td>${escapeHtml(r.grade_name)} ${escapeHtml(r.section)}</td><td>${escapeHtml(r.month)}</td><td>₨${r.total_amount.toLocaleString()}</td><td>${r.discount_amount>0?`-₨${r.discount_amount.toLocaleString()}`:'—'}</td><td>₨${r.final_amount.toLocaleString()}</td><td>₨${r.paid_amount.toLocaleString()}</td><td class="${r.status}">${r.status.charAt(0).toUpperCase()+r.status.slice(1)}</td></tr>`).join('')}</tbody></table>`;
    void printReport('Fee Report', style, body);
  };

  return (
    <ReportPage
      title="Fee Report"
      subtitle="Fee allocations · payment status · outstanding dues"
      onRefresh={() => fetchData(true)}
      onExport={exportPDF}
      refreshing={refreshing}
      exportDisabled={loading || refreshing || !!sessionError || !!reportError}
      error={reportError || sessionError}
      stats={[
        { title: 'Total Billed', value: `₨${totalBilled.toLocaleString()}`, icon: ReceiptText, tone: 'purple', sub: `${records.length} records` },
        { title: 'Applied to Fees', value: `₨${totalPaid.toLocaleString()}`, icon: Banknote, tone: 'green', sub: `${paidCount} paid` },
        { title: 'Outstanding', value: `₨${totalPending.toLocaleString()}`, icon: Clock, tone: 'red', sub: `${unpaidCount} unpaid` },
        { title: 'Session Cash', value: totals.session_cash_received.toLocaleString(), icon: Banknote, tone: 'blue', sub: 'All session receipts, counted once' },
        { title: 'Session Advance Credit', value: totals.session_advance_credit.toLocaleString(), icon: Banknote, tone: 'purple', sub: 'All session unapplied credit' },
        { title: 'Recovery Rate', value: `${recoveryRate}%`, icon: TrendingUp, tone: 'blue' },
      ]}
    >
      <ReportFilters count={records.length}>
        <ReportFilterSelect label="Academic session" value={sessionId} onChange={setSessionId} options={sessions.map(s => ({ value: String(s.id), label: s.name }))} />
        <ReportFilterSelect label="Grade" value={gradeFilter} onChange={setGradeFilter} options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
        <ReportFilterSelect label="Month" value={monthFilter} onChange={setMonthFilter} options={[{ value: 'all', label: 'All Months' }, ...MONTHS.map(m => ({ value: m, label: m }))]} />
        <ReportFilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All Statuses' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partial' }]} />
      </ReportFilters>

      <ReportTable label="Fee records" columns={['Grade', 'Month', 'Billed', 'Discount', 'Final', 'Payment', 'Status']}
        loading={loading && !sessionError} icon={ReceiptText} empty="No fee records found"
        rows={records.map((record) => ({
          key: record.id,
          person: <ReportPerson name={record.student_name} admissionNo={record.admission_no} />,
          values: [
            <ReportClass key="grade" grade={record.grade_name} section={record.section} />,
            record.month,
            `₨${record.total_amount.toLocaleString()}`,
            record.discount_amount > 0
              ? <span key="discount" className="text-emerald-600 dark:text-emerald-400">−₨{record.discount_amount.toLocaleString()}</span> : '—',
            <strong key="final" className="font-semibold text-slate-900 dark:text-slate-100">₨{record.final_amount.toLocaleString()}</strong>,
            <ReportPayment key="payment" paid={record.paid_amount} total={record.final_amount} />,
            <ReportPaymentStatus key="status" status={record.status} />,
          ],
        }))}
      />
    </ReportPage>
  );
}

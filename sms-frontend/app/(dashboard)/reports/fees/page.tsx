'use client';

import { useEffect, useState } from 'react';
import { Box, CircularProgress, Grid, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import {
  C, FONT, EASE, thSx, tdSx, GlobalStyles, MiniStatCard,
  ReportHeader, ReportFiltersCard, ReportFilterSelect,
  DataTable, PayBar, FeeStatusChip, ClassChip, StudentCell,
} from '@/components/ui';

type FeeRecord = {
  id: number; student_name: string; admission_no: string;
  grade_name: string; section: string; month: string;
  total_amount: number; discount_amount: number; final_amount: number;
  paid_amount: number; status: 'paid' | 'unpaid' | 'partial';
};
type Grade = { id: number; name: string };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function FeeReport() {
  const [records, setRecords]           = useState<FeeRecord[]>([]);
  const [grades, setGrades]             = useState<Grade[]>([]);
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [totals, setTotals] = useState({ billed: 0, paid: 0, pending: 0 });
  const [gradeFilter, setGradeFilter]   = useState('all');
  const [monthFilter, setMonthFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { api.get('/grades').then(r => setGrades(r.data)).catch(() => {}); fetchData(); }, []);
  useEffect(() => { fetchData(); }, [gradeFilter, monthFilter, statusFilter]);

const fetchData = async (isRefresh = false) => {
  isRefresh ? setRefreshing(true) : setLoading(true);
  try {
    const params: Record<string, any> = {};
    if (gradeFilter !== 'all')  params.grade_name = gradeFilter;
    if (monthFilter !== 'all')  params.month      = monthFilter;
    if (statusFilter !== 'all') params.status     = statusFilter;

    const res = await api.get('/reports/fees', { params });
    setRecords(res.data.items ?? []);
    setTotals({
      billed:  res.data.total_billed  ?? 0,
      paid:    res.data.total_paid    ?? 0,
      pending: res.data.total_pending ?? 0,
    });
  } catch { toast.error('Failed to load fee report'); }
  finally { setLoading(false); setRefreshing(false); }
};
  const totalBilled  = records.reduce((s, r) => s + r.final_amount, 0);
  const totalPaid    = records.reduce((s, r) => s + r.paid_amount,  0);
  const totalPending = totalBilled - totalPaid;
  const paidCount    = records.filter(r => r.status === 'paid').length;
  const unpaidCount  = records.filter(r => r.status === 'unpaid').length;
  const recoveryRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}.paid{color:#059669;font-weight:600}.unpaid{color:#dc2626;font-weight:600}.partial{color:#d97706;font-weight:600}</style>`;
    const body = `<h1>Fee Report</h1><p>Generated ${new Date().toLocaleDateString('en-PK',{dateStyle:'long'})} · ${records.length} records</p><div class="stats"><div class="stat"><div class="stat-label">Total Billed</div><div class="stat-val">₨${totalBilled.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Collected</div><div class="stat-val" style="color:#059669">₨${totalPaid.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Pending</div><div class="stat-val" style="color:#dc2626">₨${totalPending.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Recovery</div><div class="stat-val">${recoveryRate}%</div></div></div><table><thead><tr><th>#</th><th>Student</th><th>Adm No.</th><th>Grade</th><th>Month</th><th>Total</th><th>Discount</th><th>Final</th><th>Paid</th><th>Status</th></tr></thead><tbody>${records.map((r,i)=>`<tr><td>${i+1}</td><td>${r.student_name}</td><td>${r.admission_no}</td><td>${r.grade_name} ${r.section}</td><td>${r.month}</td><td>₨${r.total_amount.toLocaleString()}</td><td>${r.discount_amount>0?`-₨${r.discount_amount.toLocaleString()}`:'—'}</td><td>₨${r.final_amount.toLocaleString()}</td><td>₨${r.paid_amount.toLocaleString()}</td><td class="${r.status}">${r.status.charAt(0).toUpperCase()+r.status.slice(1)}</td></tr>`).join('')}</tbody></table>`;
    const win = window.open('','_blank'); if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Fee Report</title>${style}</head><body>${body}</body></html>`);
    win.document.close(); win.print();
  };

  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>
        <ReportHeader title="Fee Report" subtitle="Collection summary · payment status · outstanding dues" onRefresh={() => fetchData(true)} onExport={exportPDF} refreshing={refreshing} />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Billed',  value: `₨${totalBilled.toLocaleString()}`,  color: C.accent, dim: C.accentDim, sub: `${records.length} records` },
            { label: 'Collected',     value: `₨${totalPaid.toLocaleString()}`,     color: C.green,  dim: C.greenDim,  sub: `${paidCount} paid`    },
            { label: 'Outstanding',   value: `₨${totalPending.toLocaleString()}`,  color: C.red,    dim: C.redDim,    sub: `${unpaidCount} unpaid` },
            { label: 'Recovery Rate', value: `${recoveryRate}%`,                   color: C.blue,   dim: C.blueDim   },
          ].map(s => <Grid item xs={6} md={3} key={s.label}><MiniStatCard {...s} /></Grid>)}
        </Grid>

        <ReportFiltersCard count={records.length}>
          <ReportFilterSelect label="Grade" value={gradeFilter} onChange={setGradeFilter} options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
          <ReportFilterSelect label="Month" value={monthFilter} onChange={setMonthFilter} options={[{ value: 'all', label: 'All Months' }, ...MONTHS.map(m => ({ value: m, label: m }))]} />
          <ReportFilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All Statuses' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partial' }]} />
        </ReportFiltersCard>

        <DataTable>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={32} thickness={3} sx={{ color: C.accent }} /></Box>
          ) : (
            <Table>
              <TableHead><TableRow>{['#','Student','Grade','Month','Billed','Discount','Final','Payment','Status'].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {records.map((r, i) => (
                  <TableRow key={r.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}` }}>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{i + 1}</TableCell>
                    <TableCell sx={tdSx}><StudentCell name={r.student_name} admissionNo={r.admission_no} /></TableCell>
                    <TableCell sx={tdSx}><ClassChip grade={r.grade_name} section={r.section} /></TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{r.month}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>₨{r.total_amount.toLocaleString()}</TableCell>
                    <TableCell sx={{ ...tdSx, color: r.discount_amount > 0 ? C.green : C.textSecondary }}>{r.discount_amount > 0 ? `−₨${r.discount_amount.toLocaleString()}` : '—'}</TableCell>
                    <TableCell sx={{ ...tdSx, fontWeight: 700 }}>₨{r.final_amount.toLocaleString()}</TableCell>
                    <TableCell sx={tdSx}><PayBar paid={r.paid_amount} total={r.final_amount} /></TableCell>
                    <TableCell sx={tdSx}><FeeStatusChip status={r.status} /></TableCell>
                  </TableRow>
                ))}
                {records.length === 0 && <TableRow><TableCell colSpan={9} sx={{ ...tdSx, textAlign: 'center', color: C.textSecondary, py: 6 }}>No fee records found</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </DataTable>
      </Box>
    </>
  );
}
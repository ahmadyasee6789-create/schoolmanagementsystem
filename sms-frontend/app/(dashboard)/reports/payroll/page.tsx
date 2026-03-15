'use client';

import { useEffect, useState } from 'react';
import { Box, CircularProgress, Grid, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import {
  C, FONT, EASE, thSx, tdSx, GlobalStyles, MiniStatCard,
  ReportHeader, ReportFiltersCard, ReportFilterSelect,
  DataTable, PayBar, PayrollStatusChip, InitialsAvatar,
} from '@/components/ui';
import { Chip, Typography } from '@mui/material';

type PayrollRow = {
  id: number; member_name: string; role: string;
  basic_salary: number; allowances: number; deductions: number;
  net_salary: number; month: string; status: 'paid' | 'unpaid' | 'partial';
  paid_amount: number;
};
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function PayrollReport() {
  const [rows, setRows]               = useState<PayrollRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [monthFilter, setMonthFilter]   = useState(MONTHS[new Date().getMonth()]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter]     = useState('all');

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchData(); }, [monthFilter, statusFilter, roleFilter]);

  const fetchData = async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (monthFilter)            params.month  = monthFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (roleFilter !== 'all')   params.role   = roleFilter;
      const res = await api.get('/reports/payroll', { params });
      setRows(Array.isArray(res.data) ? res.data : res.data?.items ?? []);
    } catch { toast.error('Failed to load payroll report'); }
    finally { setLoading(false); setRefreshing(false); }
  };

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
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>
        <ReportHeader title="Payroll Report" subtitle="Staff salary breakdown · payment status · monthly disbursement" onRefresh={() => fetchData(true)} onExport={exportPDF} refreshing={refreshing} />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Payable',  value: `₨${totalPayable.toLocaleString()}`, color: C.accent, dim: C.accentDim, sub: `${rows.length} staff` },
            { label: 'Disbursed',      value: `₨${totalPaid.toLocaleString()}`,    color: C.green,  dim: C.greenDim,  sub: `${paidCount} paid` },
            { label: 'Outstanding',    value: `₨${totalPending.toLocaleString()}`, color: C.red,    dim: C.redDim,    sub: `${rows.length - paidCount} unpaid` },
            { label: 'Disbursement %', value: `${disbursement}%`,                  color: C.blue,   dim: C.blueDim   },
          ].map(s => <Grid item xs={6} md={3} key={s.label}><MiniStatCard {...s} /></Grid>)}
        </Grid>

        <ReportFiltersCard count={rows.length}>
          <ReportFilterSelect label="Month" value={monthFilter} onChange={setMonthFilter} options={MONTHS.map(m => ({ value: m, label: m }))} />
          <ReportFilterSelect label="Role" value={roleFilter} onChange={setRoleFilter}
            options={[{ value: 'all', label: 'All Roles' }, ...roles.map(r => ({ value: r, label: r }))]} />
          <ReportFilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[{ value: 'all', label: 'All Statuses' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partial' }]} />
        </ReportFiltersCard>

        <DataTable>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={32} thickness={3} sx={{ color: C.accent }} /></Box>
          ) : (
            <Table>
              <TableHead><TableRow>{['#','Staff Member','Role','Basic','Allowances','Deductions','Net Salary','Payment','Status'].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}` }}>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{i + 1}</TableCell>
                    <TableCell sx={tdSx}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <InitialsAvatar name={r.member_name} color={C.purple} dim={C.purpleDim} />
                        <Typography sx={{ fontFamily: FONT, fontWeight: 600, fontSize: '0.855rem', color: C.textPrimary }}>{r.member_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={tdSx}>
                      <Chip label={r.role} size="small" sx={{ backgroundColor: C.purpleDim, color: C.purple, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                    </TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>₨{r.basic_salary.toLocaleString()}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.green }}>+₨{r.allowances.toLocaleString()}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.red }}>−₨{r.deductions.toLocaleString()}</TableCell>
                    <TableCell sx={{ ...tdSx, fontWeight: 700 }}>₨{r.net_salary.toLocaleString()}</TableCell>
                    <TableCell sx={tdSx}><PayBar paid={r.paid_amount} total={r.net_salary} /></TableCell>
                    <TableCell sx={tdSx}><PayrollStatusChip status={r.status} /></TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={9} sx={{ ...tdSx, textAlign: 'center', color: C.textSecondary, py: 6 }}>No payroll records found</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </DataTable>
      </Box>
    </>
  );
}
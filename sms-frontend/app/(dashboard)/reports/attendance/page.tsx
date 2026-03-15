'use client';

import { useEffect, useState } from 'react';
import { Box, CircularProgress, Grid, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import {
  C, FONT, EASE, thSx, tdSx, GlobalStyles, MiniStatCard,
  ReportHeader, ReportFiltersCard, ReportFilterSelect,
  DataTable, AttBar, ClassChip, StudentCell,
} from '@/components/ui';

type AttendanceRow = {
  student_id: number; student_name: string; admission_no: string;
  grade_name: string; section: string;
  total_days: number; present: number; absent: number; leave: number;
  attendance_pct: number;
};
type Grade     = { id: number; name: string };
type Classroom = { id: number; grade_name: string; section: string };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendanceReport() {
  const [rows, setRows]               = useState<AttendanceRow[]>([]);
  const [grades, setGrades]           = useState<Grade[]>([]);
  const [classes, setClasses]         = useState<Classroom[]>([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [monthFilter, setMonthFilter] = useState(MONTHS[new Date().getMonth()]);
  const [gradeFilter, setGradeFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    Promise.all([api.get('/grades'), api.get('/classes/')]).then(([g, c]) => { setGrades(g.data); setClasses(c.data); });
    fetchData();
  }, []);
  useEffect(() => { fetchData(); }, [monthFilter, gradeFilter, classFilter]);

  const fetchData = async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (gradeFilter !== 'all') params.grade_name  = gradeFilter;
      if (classFilter !== 'all') params.classroom_id = classFilter;
      if (monthFilter)           params.month        = monthFilter;
      const res = await api.get('/reports/attendance', { params });
      setRows(Array.isArray(res.data) ? res.data : res.data?.items ?? []);
    } catch { toast.error('Failed to load attendance report'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const filteredClasses = gradeFilter === 'all' ? classes : classes.filter(c => c.grade_name === gradeFilter);
  const avgPct      = rows.length ? Math.round(rows.reduce((s, r) => s + r.attendance_pct, 0) / rows.length) : 0;
  const goodCount   = rows.filter(r => r.attendance_pct >= 80).length;
  const poorCount   = rows.filter(r => r.attendance_pct < 60).length;
  const totalAbsent = rows.reduce((s, r) => s + r.absent, 0);

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}.good{color:#059669}.poor{color:#dc2626}.avg{color:#d97706}</style>`;
    const body = `<h1>Attendance Report — ${monthFilter}</h1><p>Generated ${new Date().toLocaleDateString()} · ${rows.length} students</p><div class="stats"><div class="stat"><div class="stat-label">Avg Attendance</div><div class="stat-val">${avgPct}%</div></div><div class="stat"><div class="stat-label">Good (≥80%)</div><div class="stat-val" style="color:#059669">${goodCount}</div></div><div class="stat"><div class="stat-label">Poor (&lt;60%)</div><div class="stat-val" style="color:#dc2626">${poorCount}</div></div><div class="stat"><div class="stat-label">Total Absences</div><div class="stat-val">${totalAbsent}</div></div></div><table><thead><tr><th>#</th><th>Student</th><th>Grade</th><th>Present</th><th>Absent</th><th>Leave</th><th>Total Days</th><th>%</th><th>Status</th></tr></thead><tbody>${rows.map((r,i)=>{const cls=r.attendance_pct>=80?'good':r.attendance_pct>=60?'avg':'poor';const status=r.attendance_pct>=80?'Good':r.attendance_pct>=60?'Average':'Poor';return`<tr><td>${i+1}</td><td>${r.student_name}<br><small style="color:#888">${r.admission_no}</small></td><td>${r.grade_name} ${r.section}</td><td>${r.present}</td><td>${r.absent}</td><td>${r.leave}</td><td>${r.total_days}</td><td class="${cls}">${r.attendance_pct}%</td><td class="${cls}">${status}</td></tr>`;}).join('')}</tbody></table>`;
    const win = window.open('','_blank'); if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Attendance Report</title>${style}</head><body>${body}</body></html>`);
    win.document.close(); win.print();
  };

  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>
        <ReportHeader title="Attendance Report" subtitle="Monthly attendance · presence rates · absence tracking" onRefresh={() => fetchData(true)} onExport={exportPDF} refreshing={refreshing} />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Avg Attendance', value: `${avgPct}%`, color: C.accent, dim: C.accentDim },
            { label: 'Good (≥80%)',    value: goodCount,    color: C.green,  dim: C.greenDim  },
            { label: 'Poor (<60%)',    value: poorCount,    color: C.red,    dim: C.redDim    },
            { label: 'Total Absences', value: totalAbsent,  color: C.yellow, dim: C.yellowDim },
          ].map(s => <Grid item xs={6} md={3} key={s.label}><MiniStatCard {...s} /></Grid>)}
        </Grid>

        <ReportFiltersCard count={rows.length}>
          <ReportFilterSelect label="Month" value={monthFilter} onChange={setMonthFilter} options={MONTHS.map(m => ({ value: m, label: m }))} />
          <ReportFilterSelect label="Grade" value={gradeFilter} onChange={v => { setGradeFilter(v); setClassFilter('all'); }}
            options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
          <ReportFilterSelect label="Class" value={classFilter} onChange={setClassFilter}
            options={[{ value: 'all', label: 'All Classes' }, ...filteredClasses.map(c => ({ value: String(c.id), label: `${c.grade_name} – ${c.section}` }))]} />
        </ReportFiltersCard>

        <DataTable>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={32} thickness={3} sx={{ color: C.accent }} /></Box>
          ) : (
            <Table>
              <TableHead><TableRow>{['#','Student','Grade','Present','Absent','Leave','Total Days','Attendance'].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.student_id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}` }}>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{i + 1}</TableCell>
                    <TableCell sx={tdSx}><StudentCell name={r.student_name} admissionNo={r.admission_no} /></TableCell>
                    <TableCell sx={tdSx}><ClassChip grade={r.grade_name} section={r.section} /></TableCell>
                    <TableCell sx={{ ...tdSx, color: C.green,  fontWeight: 600 }}>{r.present}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.red,    fontWeight: 600 }}>{r.absent}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.yellow, fontWeight: 600 }}>{r.leave}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{r.total_days}</TableCell>
                    <TableCell sx={tdSx}><AttBar pct={r.attendance_pct} /></TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={8} sx={{ ...tdSx, textAlign: 'center', color: C.textSecondary, py: 6 }}>No attendance data found</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </DataTable>
      </Box>
    </>
  );
}
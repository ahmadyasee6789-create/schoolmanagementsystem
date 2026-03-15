'use client';

import { useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, Grid, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import {
  C, FONT, EASE, thSx, tdSx, GlobalStyles, MiniStatCard,
  ReportHeader, ReportFiltersCard, ReportFilterSelect,
  DataTable, MarkBar, GradeChip, ClassChip, StudentCell, PassRateChip,
} from '@/components/ui';

type ExamResultRow = {
  student_name: string; admission_no: string; grade_name: string; section: string;
  exam_name: string; subject_name: string;
  obtained_marks: number; total_marks: number; pass_marks: number;
  grade: string | null; gpa: number | null;
};
type Exam  = { id: number; name: string };
type Grade = { id: number; name: string };

export default function ExamReport() {
  const [rows, setRows]               = useState<ExamResultRow[]>([]);
  const [exams, setExams]             = useState<Exam[]>([]);
  const [grades, setGrades]           = useState<Grade[]>([]);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [examFilter, setExamFilter]   = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  useEffect(() => {
    Promise.all([api.get('/exams/'), api.get('/grades')]).then(([e, g]) => { setExams(e.data); setGrades(g.data); });
    fetchData();
  }, []);
  useEffect(() => { fetchData(); }, [examFilter, gradeFilter, resultFilter]);

  const fetchData = async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (examFilter !== 'all')   params.exam_id    = examFilter;
      if (gradeFilter !== 'all')  params.grade_name = gradeFilter;
      if (resultFilter !== 'all') params.result     = resultFilter;
      const res = await api.get('/reports/exam-results', { params });
      setRows(Array.isArray(res.data) ? res.data : res.data?.items ?? []);
    } catch { toast.error('Failed to load exam report'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const passCount = rows.filter(r => r.obtained_marks >= r.pass_marks).length;
  const failCount = rows.length - passCount;
  const avgPct    = rows.length ? Math.round(rows.reduce((s, r) => s + (r.obtained_marks / (r.total_marks || 1)) * 100, 0) / rows.length) : 0;
  const topScore  = rows.length ? Math.max(...rows.map(r => Math.round((r.obtained_marks / (r.total_marks || 1)) * 100))) : 0;

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}.pass{color:#059669;font-weight:600}.fail{color:#dc2626;font-weight:600}</style>`;
    const body = `<h1>Exam Results Report</h1><p>Generated ${new Date().toLocaleDateString()} · ${rows.length} records</p><div class="stats"><div class="stat"><div class="stat-label">Total</div><div class="stat-val">${rows.length}</div></div><div class="stat"><div class="stat-label">Passed</div><div class="stat-val" style="color:#059669">${passCount}</div></div><div class="stat"><div class="stat-label">Failed</div><div class="stat-val" style="color:#dc2626">${failCount}</div></div><div class="stat"><div class="stat-label">Avg Score</div><div class="stat-val">${avgPct}%</div></div></div><table><thead><tr><th>#</th><th>Student</th><th>Grade</th><th>Exam</th><th>Subject</th><th>Marks</th><th>%</th><th>Grade</th><th>GPA</th><th>Result</th></tr></thead><tbody>${rows.map((r,i)=>{const pct=Math.round((r.obtained_marks/(r.total_marks||1))*100);const pass=r.obtained_marks>=r.pass_marks;return`<tr><td>${i+1}</td><td>${r.student_name}<br><small style="color:#888">${r.admission_no}</small></td><td>${r.grade_name} ${r.section}</td><td>${r.exam_name}</td><td>${r.subject_name}</td><td>${r.obtained_marks}/${r.total_marks}</td><td>${pct}%</td><td>${r.grade??'—'}</td><td>${r.gpa?.toFixed(2)??'—'}</td><td class="${pass?'pass':'fail'}">${pass?'Pass':'Fail'}</td></tr>`;}).join('')}</tbody></table>`;
    const win = window.open('','_blank'); if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Exam Report</title>${style}</head><body>${body}</body></html>`);
    win.document.close(); win.print();
  };

  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>
        <ReportHeader title="Exam Report" subtitle="Results breakdown · grades · GPA analysis" onRefresh={() => fetchData(true)} onExport={exportPDF} refreshing={refreshing} />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Records', value: rows.length,        color: C.accent,  dim: C.accentDim  },
            { label: 'Passed',        value: passCount,          color: C.green,   dim: C.greenDim   },
            { label: 'Failed',        value: failCount,          color: C.red,     dim: C.redDim     },
            { label: 'Average Score', value: `${avgPct}%`,       color: C.blue,    dim: C.blueDim    },
            { label: 'Top Score',     value: `${topScore}%`,     color: C.purple,  dim: C.purpleDim  },
            { label: 'Pass Rate',     value: rows.length ? `${Math.round((passCount / rows.length) * 100)}%` : '0%', color: C.green, dim: C.greenDim },
          ].map(s => <Grid item xs={6} md={2} key={s.label}><MiniStatCard {...s} /></Grid>)}
        </Grid>

        <ReportFiltersCard count={rows.length}>
          <ReportFilterSelect label="Exam" value={examFilter} onChange={setExamFilter} options={[{ value: 'all', label: 'All Exams' }, ...exams.map(e => ({ value: String(e.id), label: e.name }))]} />
          <ReportFilterSelect label="Grade" value={gradeFilter} onChange={setGradeFilter} options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
          <ReportFilterSelect label="Result" value={resultFilter} onChange={setResultFilter} options={[{ value: 'all', label: 'All Results' }, { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }]} />
        </ReportFiltersCard>

        <DataTable>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={32} thickness={3} sx={{ color: C.accent }} /></Box>
          ) : (
            <Table>
              <TableHead><TableRow>{['#','Student','Grade','Exam','Subject','Marks','Grade','GPA','Result'].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((r, i) => {
                  const pass = r.obtained_marks >= r.pass_marks;
                  return (
                    <TableRow key={i} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}` }}>
                      <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{i + 1}</TableCell>
                      <TableCell sx={tdSx}><StudentCell name={r.student_name} admissionNo={r.admission_no} /></TableCell>
                      <TableCell sx={tdSx}><ClassChip grade={r.grade_name} section={r.section} /></TableCell>
                      <TableCell sx={{ ...tdSx, color: C.textSecondary, fontSize: '0.8rem' }}>{r.exam_name}</TableCell>
                      <TableCell sx={tdSx}><Chip label={r.subject_name} size="small" sx={{ backgroundColor: C.blueDim, color: C.blue, fontFamily: FONT, fontWeight: 600, fontSize: '0.7rem', height: 22 }} /></TableCell>
                      <TableCell sx={tdSx}><MarkBar obtained={r.obtained_marks} total={r.total_marks} pass={r.pass_marks} /></TableCell>
                      <TableCell sx={tdSx}><GradeChip grade={r.grade} /></TableCell>
                      <TableCell sx={{ ...tdSx, color: C.blue, fontWeight: 700 }}>{r.gpa?.toFixed(2) ?? '—'}</TableCell>
                      <TableCell sx={tdSx}><Chip label={pass ? 'Pass' : 'Fail'} size="small" sx={{ backgroundColor: pass ? C.greenDim : C.redDim, color: pass ? C.green : C.red, fontFamily: FONT, fontWeight: 700, fontSize: '0.7rem', height: 22 }} /></TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && <TableRow><TableCell colSpan={9} sx={{ ...tdSx, textAlign: 'center', color: C.textSecondary, py: 6 }}>No exam results found</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </DataTable>
      </Box>
    </>
  );
}
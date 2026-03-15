'use client';

import { useEffect, useState } from 'react';
import { Box, CircularProgress, Grid, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@mui/material';
import { Search } from '@mui/icons-material';
import { api } from '@/app/lib/api';
import toast from 'react-hot-toast';
import {
  C, FONT, EASE, thSx, tdSx, inputSx, GlobalStyles, MiniStatCard,
  ReportHeader, ReportFiltersCard, ReportFilterSelect,
  DataTable, ClassChip, ActiveChip, StudentCell,
} from '@/components/ui';

type StudentRow = {
  id: number; admission_no: string; first_name: string; last_name: string;
  gender: string; date_of_birth: string; phone: string | null;
  father_name: string | null; father_phone: string | null;
  grade_name: string | null; section: string | null;
  roll_number: number | null; is_active: boolean;
};
type Grade = { id: number; name: string };

export default function StudentReport() {
  const [students, setStudents]         = useState<StudentRow[]>([]);
  const [grades, setGrades]             = useState<Grade[]>([]);
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');
  const [gradeFilter, setGradeFilter]   = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { api.get('/grades').then(r => setGrades(r.data)); fetchData(); }, []);
  useEffect(() => { fetchData(); }, [gradeFilter, genderFilter, statusFilter]);

  const fetchData = async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const params: Record<string, string> = { limit: '500' };
      if (gradeFilter !== 'all')  params.grade_name = gradeFilter;
      if (genderFilter !== 'all') params.gender     = genderFilter;
      const res = await api.get('/students/', { params });
      let data = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
      if (statusFilter === 'active')   data = data.filter((s: StudentRow) => s.is_active);
      if (statusFilter === 'inactive') data = data.filter((s: StudentRow) => !s.is_active);
      setStudents(data);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const filtered = students.filter(s => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase()) || s.admission_no.toLowerCase().includes(search.toLowerCase());
  });

  const maleCount   = students.filter(s => s.gender === 'male').length;
  const femaleCount = students.filter(s => s.gender === 'female').length;
  const activeCount = students.filter(s => s.is_active).length;

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}</style>`;
    const body = `<h1>Student Report</h1><p>Generated ${new Date().toLocaleDateString()} · ${filtered.length} students</p><div class="stats"><div class="stat"><div class="stat-label">Total</div><div class="stat-val">${filtered.length}</div></div><div class="stat"><div class="stat-label">Male</div><div class="stat-val">${maleCount}</div></div><div class="stat"><div class="stat-label">Female</div><div class="stat-val">${femaleCount}</div></div><div class="stat"><div class="stat-label">Active</div><div class="stat-val">${activeCount}</div></div></div><table><thead><tr><th>#</th><th>Adm No.</th><th>Name</th><th>Gender</th><th>DOB</th><th>Grade</th><th>Roll No.</th><th>Father</th><th>Phone</th><th>Status</th></tr></thead><tbody>${filtered.map((s,i)=>`<tr><td>${i+1}</td><td>${s.admission_no}</td><td>${s.first_name} ${s.last_name}</td><td>${s.gender}</td><td>${s.date_of_birth??'—'}</td><td>${s.grade_name??'—'} ${s.section??''}</td><td>${s.roll_number??'—'}</td><td>${s.father_name??'—'}</td><td>${s.father_phone??'—'}</td><td>${s.is_active?'Active':'Inactive'}</td></tr>`).join('')}</tbody></table>`;
    const win = window.open('','_blank'); if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Student Report</title>${style}</head><body>${body}</body></html>`);
    win.document.close(); win.print();
  };

  return (
    <>
      <GlobalStyles />
      <Box sx={{ p: { xs: 2, sm: 3 }, backgroundColor: C.bg, minHeight: '100%' }}>
        <ReportHeader title="Student Report" subtitle="Enrolment overview · demographics · contact directory" onRefresh={() => fetchData(true)} onExport={exportPDF} refreshing={refreshing} />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Students', value: students.length, color: C.accent, dim: C.accentDim },
            { label: 'Male',           value: maleCount,       color: C.blue,   dim: C.blueDim   },
            { label: 'Female',         value: femaleCount,     color: '#F472B6', dim: 'rgba(244,114,182,0.1)' },
            { label: 'Active',         value: activeCount,     color: C.green,  dim: C.greenDim  },
          ].map(s => <Grid item xs={6} md={3} key={s.label}><MiniStatCard {...s} /></Grid>)}
        </Grid>

        <ReportFiltersCard count={filtered.length}>
          <Grid item xs={12} md={3}>
            <TextField fullWidth placeholder="Search name or adm. no…" value={search} onChange={e => setSearch(e.target.value)} sx={inputSx}
              InputProps={{ startAdornment: <Search sx={{ color: C.textSecondary, mr: 1, fontSize: 18 }} /> }} />
          </Grid>
          <ReportFilterSelect label="Grade" value={gradeFilter} onChange={setGradeFilter} md={3} options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
          <ReportFilterSelect label="Gender" value={genderFilter} onChange={setGenderFilter} md={3} options={[{ value: 'all', label: 'All Genders' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
          <ReportFilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} md={3} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </ReportFiltersCard>

        <DataTable>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={32} thickness={3} sx={{ color: C.accent }} /></Box>
          ) : (
            <Table>
              <TableHead><TableRow>{['#','Student','Gender','Grade','Roll No.','Father','Phone','Status'].map(h => <TableCell key={h} sx={thSx}>{h}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {filtered.map((s, i) => (
                  <TableRow key={s.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, transition: `background ${EASE}` }}>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{i + 1}</TableCell>
                    <TableCell sx={tdSx}><StudentCell name={`${s.first_name} ${s.last_name}`} admissionNo={s.admission_no} /></TableCell>
                    <TableCell sx={tdSx}>
                      <Box sx={{ px: 1.5, py: 0.3, borderRadius: '6px', display: 'inline-block', backgroundColor: s.gender === 'male' ? C.blueDim : 'rgba(244,114,182,0.1)' }}>
                        <span style={{ fontSize: '0.72rem', fontFamily: FONT, fontWeight: 600, color: s.gender === 'male' ? C.blue : '#F472B6', textTransform: 'capitalize' }}>{s.gender}</span>
                      </Box>
                    </TableCell>
                    <TableCell sx={tdSx}><ClassChip grade={s.grade_name} section={s.section} /></TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{s.roll_number ?? '—'}</TableCell>
                    <TableCell sx={tdSx}>{s.father_name ?? '—'}</TableCell>
                    <TableCell sx={{ ...tdSx, color: C.textSecondary }}>{s.father_phone ?? '—'}</TableCell>
                    <TableCell sx={tdSx}><ActiveChip active={s.is_active} /></TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={8} sx={{ ...tdSx, textAlign: 'center', color: C.textSecondary, py: 6 }}>No students found</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </DataTable>
      </Box>
    </>
  );
}
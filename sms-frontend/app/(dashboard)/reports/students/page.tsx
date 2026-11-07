'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, UserCheck, UserRound, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { escapeHtml, printReport } from '@/components/reports/reportExport';
import { useReportSession } from '@/components/reports/useReportSession';
import { inputClass } from '@/components/exams/ExamUi';
import { Badge, LabeledField } from '@/components/finance/FinanceUi';
import {
  ReportClass, ReportFilterSelect, ReportFilters, ReportPage, ReportPerson, ReportTable,
} from '@/components/reports/ReportUi';

type StudentRow = {
  id: number; admission_no: string; first_name: string; last_name: string;
  gender: string; date_of_birth: string; phone: string | null;
  father_name: string | null; father_phone: string | null;
  grade_name: string | null; section: string | null;
  roll_number: number | null; is_active: boolean;
};
type Grade = { id: number; name: string };

export default function StudentReport() {
  const { sessionId, setSessionId, sessions, sessionError } = useReportSession();
  const [reportError, setReportError] = useState('');
  const requestId = useRef(0);
  const cancelRequest = useCallback(() => { requestId.current++; }, []);
  const [students, setStudents]         = useState<StudentRow[]>([]);
  const [grades, setGrades]             = useState<Grade[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');
  const [gradeFilter, setGradeFilter]   = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    void api.get('/grades').then(r => setGrades(r.data)).catch(() => toast.error('Failed to load student filters'));
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!sessionId) return;
    const request = ++requestId.current;
    setReportError('');
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params: Record<string, string> = { session_id: sessionId };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (gradeFilter !== 'all')  params.grade_name = gradeFilter;
      if (genderFilter !== 'all') params.gender     = genderFilter;
      const res = await api.get('/reports/students', { params });
      if (request !== requestId.current) return;
      let data = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
      if (statusFilter === 'active')   data = data.filter((s: StudentRow) => s.is_active);
      if (statusFilter === 'inactive') data = data.filter((s: StudentRow) => !s.is_active);
      setStudents(data);
    } catch { if (request !== requestId.current) return; setReportError('Could not load this report. Check your permissions and filters, then press Refresh to retry.'); setStudents([]); toast.error('Failed to load students'); }
    finally { if (request === requestId.current) { setLoading(false); setRefreshing(false); } }
  }, [sessionId, gradeFilter, genderFilter, statusFilter]);

  useEffect(() => { void fetchData(); return cancelRequest; }, [fetchData, cancelRequest]);

  const filtered = students.filter(s => {
    const name = `${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}`.toLowerCase();
    return name.includes(search.toLowerCase()) || s.admission_no.toLowerCase().includes(search.toLowerCase());
  });

  const maleCount   = filtered.filter(s => s.gender === 'male').length;
  const femaleCount = filtered.filter(s => s.gender === 'female').length;
  const activeCount = filtered.filter(s => s.is_active).length;

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}</style>`;
    const body = `<h1>Student Report</h1><p>Generated ${new Date().toLocaleDateString()} · ${filtered.length} students</p><div class="stats"><div class="stat"><div class="stat-label">Total</div><div class="stat-val">${filtered.length}</div></div><div class="stat"><div class="stat-label">Male</div><div class="stat-val">${maleCount}</div></div><div class="stat"><div class="stat-label">Female</div><div class="stat-val">${femaleCount}</div></div><div class="stat"><div class="stat-label">Active</div><div class="stat-val">${activeCount}</div></div></div><table><thead><tr><th>#</th><th>Adm No.</th><th>Name</th><th>Gender</th><th>DOB</th><th>Grade</th><th>Roll No.</th><th>Father</th><th>Phone</th><th>Status</th></tr></thead><tbody>${filtered.map((s,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(s.admission_no)}</td><td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td><td>${escapeHtml(s.gender)}</td><td>${escapeHtml(s.date_of_birth??'—')}</td><td>${escapeHtml(s.grade_name??'—')} ${escapeHtml(s.section??'')}</td><td>${escapeHtml(s.roll_number??'—')}</td><td>${escapeHtml(s.father_name??'—')}</td><td>${escapeHtml(s.father_phone??'—')}</td><td>${s.is_active?'Active':'Inactive'}</td></tr>`).join('')}</tbody></table>`;
    void printReport('Students Report', style, body);
  };

  return (
    <ReportPage
      title="Student Report"
      subtitle="Enrolment overview · demographics · contact directory"
      onRefresh={() => fetchData(true)}
      onExport={exportPDF}
      refreshing={refreshing}
      exportDisabled={loading || refreshing || !!sessionError || !!reportError}
      error={reportError || sessionError}
      stats={[
        { title: 'Total Students', value: filtered.length, icon: Users, tone: 'purple' },
        { title: 'Male', value: maleCount, icon: UserRound, tone: 'blue' },
        { title: 'Female', value: femaleCount, icon: UserRound, tone: 'purple' },
        { title: 'Active', value: activeCount, icon: UserCheck, tone: 'green' },
      ]}
    >
      <ReportFilters count={filtered.length}>
        <ReportFilterSelect label="Academic session" value={sessionId} onChange={setSessionId} options={sessions.length ? sessions.map(s => ({ value: String(s.id), label: s.name })) : [{ value: '', label: 'Loading sessions…' }]} />
        <LabeledField label="Search">
          <span className="relative block">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input type="search" placeholder="Name or admission no." value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-9`} />
          </span>
        </LabeledField>
        <ReportFilterSelect label="Grade" value={gradeFilter} onChange={setGradeFilter} options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
        <ReportFilterSelect label="Gender" value={genderFilter} onChange={setGenderFilter} options={[{ value: 'all', label: 'All Genders' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        <ReportFilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
      </ReportFilters>

      <ReportTable label="Students" columns={['Gender', 'Grade', 'Roll No.', 'Father', 'Phone', 'Status']}
        loading={loading && !sessionError} icon={Users} empty="No students found"
        rows={filtered.map((student) => ({
          key: student.id,
          person: <ReportPerson name={`${student.first_name} ${student.last_name}`} admissionNo={student.admission_no} />,
          values: [
            <Badge key="gender" tone={student.gender === 'male' ? 'blue' : 'purple'}><span className="capitalize">{student.gender}</span></Badge>,
            <ReportClass key="grade" grade={student.grade_name} section={student.section} />,
            student.roll_number ?? '—',
            student.father_name ?? '—',
            student.father_phone ?? '—',
            <Badge key="status" tone={student.is_active ? 'green' : 'red'}>{student.is_active ? 'Active' : 'Inactive'}</Badge>,
          ],
        }))}
      />
    </ReportPage>
  );
}

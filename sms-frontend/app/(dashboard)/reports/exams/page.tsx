'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, CircleX, ClipboardList, Target, TrendingUp, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { Badge } from '@/components/finance/FinanceUi';
import {
  ReportClass, ReportFilterSelect, ReportFilters, ReportPage, ReportPerson, ReportProgress, ReportTable,
} from '@/components/reports/ReportUi';

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
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [examFilter, setExamFilter]   = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  useEffect(() => {
    void Promise.all([api.get('/exams/'), api.get('/grades')])
      .then(([e, g]) => { setExams(e.data); setGrades(g.data); })
      .catch(() => toast.error('Failed to load exam filters'));
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (examFilter !== 'all')   params.exam_id    = examFilter;
      if (gradeFilter !== 'all')  params.grade_name = gradeFilter;
      if (resultFilter !== 'all') params.result     = resultFilter;
      const res = await api.get('/reports/exam-results', { params });
      setRows(Array.isArray(res.data) ? res.data : res.data?.items ?? []);
    } catch { toast.error('Failed to load exam report'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [examFilter, gradeFilter, resultFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

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
    <ReportPage
      title="Exam Report"
      subtitle="Results breakdown · grades · GPA analysis"
      onRefresh={() => fetchData(true)}
      onExport={exportPDF}
      refreshing={refreshing}
      stats={[
        { title: 'Total Records', value: rows.length, icon: ClipboardList, tone: 'purple' },
        { title: 'Passed', value: passCount, icon: CircleCheck, tone: 'green' },
        { title: 'Failed', value: failCount, icon: CircleX, tone: 'red' },
        { title: 'Average Score', value: `${avgPct}%`, icon: TrendingUp, tone: 'blue' },
        { title: 'Top Score', value: `${topScore}%`, icon: Trophy, tone: 'purple' },
        { title: 'Pass Rate', value: rows.length ? `${Math.round((passCount / rows.length) * 100)}%` : '0%', icon: Target, tone: 'green' },
      ]}
    >
      <ReportFilters count={rows.length}>
        <ReportFilterSelect label="Exam" value={examFilter} onChange={setExamFilter} options={[{ value: 'all', label: 'All Exams' }, ...exams.map(e => ({ value: String(e.id), label: e.name }))]} />
        <ReportFilterSelect label="Grade" value={gradeFilter} onChange={setGradeFilter} options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
        <ReportFilterSelect label="Result" value={resultFilter} onChange={setResultFilter} options={[{ value: 'all', label: 'All Results' }, { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }]} />
      </ReportFilters>

      <ReportTable label="Exam results" columns={['Class', 'Exam', 'Subject', 'Marks', 'Grade', 'GPA', 'Result']}
        loading={loading} icon={ClipboardList} empty="No exam results found"
        rows={rows.map((row, index) => {
          const pass = row.obtained_marks >= row.pass_marks;
          const percent = row.total_marks > 0 ? Math.round((row.obtained_marks / row.total_marks) * 100) : 0;
          const grade = row.grade?.toUpperCase();
          const gradeTone = !grade ? 'slate' : ['A+', 'A', 'A1'].includes(grade) ? 'green'
            : ['B+', 'B', 'B1'].includes(grade) ? 'blue' : ['C+', 'C', 'C1', 'D', 'D1'].includes(grade) ? 'purple' : 'red';
          return {
            key: index,
            person: <ReportPerson name={row.student_name} admissionNo={row.admission_no} />,
            values: [
              <ReportClass key="class" grade={row.grade_name} section={row.section} />,
              row.exam_name,
              <Badge key="subject" tone="blue">{row.subject_name}</Badge>,
              <ReportProgress key="marks" value={`${row.obtained_marks}/${row.total_marks}`} percent={percent} tone={pass ? 'green' : 'red'} />,
              row.grade ? <Badge key="grade" tone={gradeTone}>{row.grade}</Badge> : '—',
              row.gpa?.toFixed(2) ?? '—',
              <Badge key="result" tone={pass ? 'green' : 'red'}>{pass ? 'Pass' : 'Fail'}</Badge>,
            ],
          };
        })}
      />
    </ReportPage>
  );
}

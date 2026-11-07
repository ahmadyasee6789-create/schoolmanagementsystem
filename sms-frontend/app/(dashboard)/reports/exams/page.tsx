'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, ClipboardList, Target, TrendingUp, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { Badge } from '@/components/finance/FinanceUi';
import MarksSheetExport from '@/components/exams/MarksSheetExport';
import type { ResultSheet } from '@/components/exams/resultSheet';
import { useReportSession } from '@/components/reports/useReportSession';
import { ReportClass, ReportFilterSelect, ReportFilters, ReportPage, ReportPerson, ReportTable } from '@/components/reports/ReportUi';

type Option = { id: number; name: string };
type Classroom = { id: number; grade_name: string; section: string };
export default function ExamReport() {
  const { sessionId, setSessionId, sessions, sessionError } = useReportSession();
  const [sheet, setSheet] = useState<ResultSheet | null>(null);
  const [exams, setExams] = useState<Option[]>([]);
  const [grades, setGrades] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [examFilter, setExamFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const cancelRequest = useCallback(() => { requestId.current++; }, []);

  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    void Promise.all([api.get('/reports/options', { params: { session_id: sessionId } }), api.get('/grades'), api.get('/classes', { params: { session_id: sessionId } })])
      .then(([e, g, c]) => {
        if (!current) return;
        setExams(e.data.exams); setGrades(g.data); setClasses(c.data);
        setExamFilter(value => e.data.exams.some((exam: Option) => String(exam.id) === value) ? value : String(e.data.exams[0]?.id ?? ''));
      }).catch(() => { if (current) { setLoading(false); setError('Could not load examination filters. Reload this page to retry.'); } });
    return () => { current = false; };
  }, [sessionId]);

  const params: Record<string, string> = { session_id: sessionId, exam_id: examFilter };
  if (gradeFilter !== 'all') params.grade_name = gradeFilter;
  if (classFilter !== 'all') params.classroom_id = classFilter;
  if (resultFilter !== 'all') params.result = resultFilter;
  const fetchData = useCallback(async (refresh = false) => {
    if (!sessionId || !examFilter) return;
    const request = ++requestId.current;
    setError(''); setLoading(true); setRefreshing(refresh);
    try {
      const query: Record<string, string> = { session_id: sessionId, exam_id: examFilter };
      if (gradeFilter !== 'all') query.grade_name = gradeFilter;
      if (classFilter !== 'all') query.classroom_id = classFilter;
      if (resultFilter !== 'all') query.result = resultFilter;
      const response = await api.get<ResultSheet>('/reports/exam-summary', { params: query });
      if (request === requestId.current) setSheet(response.data);
    } catch { if (request === requestId.current) { setSheet(null); setError('Could not load this report. Check your permissions and filters, then press Refresh.'); toast.error('Failed to load exam report'); } }
    finally { if (request === requestId.current) { setLoading(false); setRefreshing(false); } }
  }, [sessionId, examFilter, gradeFilter, classFilter, resultFilter]);
  useEffect(() => { void fetchData(); return cancelRequest; }, [fetchData, cancelRequest]);

  const rows = sheet?.items ?? [];
  const completed = rows.filter(row => row.percentage !== null);
  const passed = rows.filter(row => row.result === 'PASSED').length;
  const failed = rows.filter(row => row.result === 'FAILED').length;
  const incomplete = rows.filter(row => row.result === 'INCOMPLETE').length;
  const average = completed.length ? Math.round(completed.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / completed.length) : 0;
  const columns = sheet?.columns ?? [];
  const unavailable = loading || refreshing || !examFilter || !!error || !!sessionError;
  return <ReportPage title="Exam Report" subtitle="Saved student results · subject marks · overall evaluation"
    onRefresh={() => void fetchData(true)} refreshing={refreshing} error={error || sessionError}
    exportActions={<MarksSheetExport endpoint="/reports/exam-summary/export" params={params} report disabled={unavailable} />}
    stats={[
      { title: 'Student Evaluations', value: rows.length, icon: ClipboardList, tone: 'purple' },
      { title: 'Passed', value: passed, icon: CircleCheck, tone: 'green' },
      { title: 'Failed', value: failed, icon: CircleX, tone: 'red' },
      { title: 'Average Score', value: `${average}%`, icon: TrendingUp, tone: 'blue' },
      { title: 'Top Score', value: `${completed.length ? Math.max(...completed.map(row => row.percentage ?? 0)) : 0}%`, icon: Trophy, tone: 'purple' },
      { title: 'Incomplete', value: incomplete, icon: Target, tone: 'amber' },
      { title: 'Pass Rate', value: rows.length ? `${Math.round(passed / rows.length * 100)}%` : '0%', icon: Target, tone: 'green' },
    ]}>
    <ReportFilters count={rows.length}>
      <ReportFilterSelect label="Academic session" value={sessionId} onChange={value => { setSessionId(value); setExamFilter(''); setSheet(null); setClassFilter('all'); }} options={sessions.map(s => ({ value: String(s.id), label: s.name }))} />
      <ReportFilterSelect label="Exam" value={examFilter} onChange={setExamFilter} options={exams.length ? exams.map(e => ({ value: String(e.id), label: e.name })) : [{ value: '', label: 'No exams available' }]} />
      <ReportFilterSelect label="Grade" value={gradeFilter} onChange={value => { setGradeFilter(value); setClassFilter('all'); }} options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
      <ReportFilterSelect label="Classroom" value={classFilter} onChange={setClassFilter} options={[{ value: 'all', label: 'All Classes' }, ...classes.filter(c => gradeFilter === 'all' || c.grade_name === gradeFilter).map(c => ({ value: String(c.id), label: `${c.grade_name} ${c.section}` }))]} />
      <ReportFilterSelect label="Result" value={resultFilter} onChange={setResultFilter} options={[{ value: 'all', label: 'All Results' }, { value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'incomplete', label: 'Incomplete' }]} />
    </ReportFilters>
    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">One student per row for the selected examination. Missing = marks not saved. N/A = subject not assigned to that class.</p>
    <ReportTable label="Exam results" columns={['Roll No.', 'Class', ...columns.map(c => `${c.subject_name} (${c.total_marks})`), 'Total Marks', 'Percentage', 'Grade', 'GPA', 'Failed Subjects', 'Overall Result']}
      loading={!!sessionId && !!examFilter && loading && !sessionError} icon={ClipboardList} empty="No exam results found"
      rows={rows.map(row => ({ key: row.enrollment_id, person: <ReportPerson name={row.student_name} admissionNo={row.admission_no ?? undefined} />,
        values: [row.roll_number ?? 'Unassigned', <ReportClass key="class" grade={row.grade_name} section={row.section} />,
          ...columns.map(column => {
            const subject = row.subjects.find(s => s.key === column.key);
            return <span key={column.key}>{subject ? subject.obtained_marks ?? 'Missing' : 'N/A'}</span>;
          }), `${row.obtained_total}/${row.possible_total}`, row.percentage === null ? 'Incomplete' : `${row.percentage}%`,
          row.grade ?? 'Unassigned', row.gpa?.toFixed(2) ?? 'Unassigned', row.failed_count,
          <Badge key="result" tone={row.result === 'PASSED' ? 'green' : row.result === 'FAILED' ? 'red' : 'slate'}>{row.result}{row.missing_count ? ` · ${row.missing_count} missing` : ''}</Badge>],
      }))} />
  </ReportPage>;
}

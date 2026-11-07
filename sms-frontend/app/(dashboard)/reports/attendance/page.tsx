'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarX, Clock, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';
import { escapeHtml, printReport } from '@/components/reports/reportExport';
import { useReportSession } from '@/components/reports/useReportSession';
import {
  ReportClass, ReportFilterSelect, ReportFilters, ReportPage, ReportPerson, ReportProgress, ReportTable,
} from '@/components/reports/ReportUi';

type AttendanceRow = {
  student_id: number; student_name: string; admission_no: string;
  grade_name: string; section: string;
  total_days: number; present: number; absent: number; leave: number;
  attendance_pct: number | null; late: number; other: number;
};
type Grade     = { id: number; name: string };
type Classroom = { id: number; grade_name: string; section: string };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendanceReport() {
  const { sessionId, setSessionId, sessions, sessionError } = useReportSession();
  const [reportError, setReportError] = useState('');
  const requestId = useRef(0);
  const cancelRequest = useCallback(() => { requestId.current++; }, []);
  const [rows, setRows]               = useState<AttendanceRow[]>([]);
  const [grades, setGrades]           = useState<Grade[]>([]);
  const [classes, setClasses]         = useState<Classroom[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [monthFilter, setMonthFilter] = useState(MONTHS[new Date().getMonth()]);
  const [gradeFilter, setGradeFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    void Promise.all([api.get('/grades'), api.get('/classes/', { params: { session_id: sessionId } })])
      .then(([g, c]) => { if (current) { setGrades(g.data); setClasses(c.data); } })
      .catch(() => { if (current) toast.error('Failed to load attendance filters'); });
    return () => { current = false; };
  }, [sessionId]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!sessionId) return;
    const request = ++requestId.current;
    setReportError('');
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params: Record<string, string> = { session_id: sessionId };
      if (gradeFilter !== 'all') params.grade_name  = gradeFilter;
      if (classFilter !== 'all') params.classroom_id = classFilter;
      if (monthFilter)           params.month        = monthFilter;
      const res = await api.get('/reports/attendance', { params });
      if (request !== requestId.current) return;
      setRows(Array.isArray(res.data) ? res.data : res.data?.items ?? []);
    } catch { if (request !== requestId.current) return; setReportError('Could not load this report. Check your permissions and filters, then press Refresh to retry.'); setRows([]); toast.error('Failed to load attendance report'); }
    finally { if (request === requestId.current) { setLoading(false); setRefreshing(false); } }
  }, [sessionId, monthFilter, gradeFilter, classFilter]);

  useEffect(() => { void fetchData(); return cancelRequest; }, [fetchData, cancelRequest]);

  const filteredClasses = gradeFilter === 'all' ? classes : classes.filter(c => c.grade_name === gradeFilter);
  const recorded = rows.filter(r => r.attendance_pct !== null);
  const avgPct = recorded.length ? Math.round(recorded.reduce((s, r) => s + (r.attendance_pct ?? 0), 0) / recorded.length) : 0;
  const goodCount   = rows.filter(r => (r.attendance_pct ?? -1) >= 80).length;
  const poorCount   = rows.filter(r => r.attendance_pct !== null && r.attendance_pct < 60).length;
  const totalAbsent = rows.reduce((s, r) => s + r.absent, 0);

  const exportPDF = () => {
    const style = `<style>body{font-family:sans-serif;padding:24px;color:#111}h1{font-size:20px;margin-bottom:4px}p{font-size:12px;color:#666;margin-bottom:16px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{background:#f9f9f9;border-radius:8px;padding:12px;flex:1}.stat-label{font-size:10px;text-transform:uppercase;color:#888}.stat-val{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#f3f4f6;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#666}td{padding:8px;border-bottom:1px solid #e5e7eb}.good{color:#059669}.poor{color:#dc2626}.avg{color:#d97706}</style>`;
    const body = `<h1>Attendance Report — ${monthFilter}</h1><p>Generated ${new Date().toLocaleDateString()} · ${rows.length} students</p><div class="stats"><div class="stat"><div class="stat-label">Avg Attendance</div><div class="stat-val">${avgPct}%</div></div><div class="stat"><div class="stat-label">Good (≥80%)</div><div class="stat-val" style="color:#059669">${goodCount}</div></div><div class="stat"><div class="stat-label">Poor (&lt;60%)</div><div class="stat-val" style="color:#dc2626">${poorCount}</div></div><div class="stat"><div class="stat-label">Total Absences</div><div class="stat-val">${totalAbsent}</div></div></div><table><thead><tr><th>#</th><th>Student</th><th>Grade</th><th>Present</th><th>Absent</th><th>Leave</th><th>Late</th><th>Other</th><th>Recorded Days</th><th>%</th><th>Status</th></tr></thead><tbody>${rows.map((r,i)=>{const cls=(r.attendance_pct??-1)>=80?'good':(r.attendance_pct??-1)>=60?'avg':'poor';const status=r.attendance_pct===null?'Not recorded':r.attendance_pct>=80?'Good':r.attendance_pct>=60?'Average':'Poor';return`<tr><td>${i+1}</td><td>${escapeHtml(r.student_name)}<br><small style="color:#888">${escapeHtml(r.admission_no)}</small></td><td>${escapeHtml(r.grade_name)} ${escapeHtml(r.section)}</td><td>${r.present}</td><td>${r.absent}</td><td>${r.leave}</td><td>${r.late}</td><td>${r.other}</td><td>${r.total_days}</td><td class="${cls}">${r.attendance_pct ?? "Not recorded"}${r.attendance_pct === null ? "" : "%"}</td><td class="${cls}">${status}</td></tr>`;}).join('')}</tbody></table>`;
    void printReport('Attendance Report', style, body);
  };

  return (
    <ReportPage
      title="Attendance Report"
      subtitle="Monthly attendance · presence rates · absence tracking"
      onRefresh={() => fetchData(true)}
      onExport={exportPDF}
      refreshing={refreshing}
      exportDisabled={loading || refreshing || !!sessionError || !!reportError}
      error={reportError || sessionError}
      stats={[
        { title: 'Avg Attendance', value: `${avgPct}%`, icon: TrendingUp, tone: 'purple' },
        { title: 'Good (≥80%)', value: goodCount, icon: CalendarCheck, tone: 'green' },
        { title: 'Poor (<60%)', value: poorCount, icon: CalendarX, tone: 'red' },
        { title: 'Total Absences', value: totalAbsent, icon: Clock, tone: 'amber' },
      ]}
    >
      <ReportFilters count={rows.length}>
        <ReportFilterSelect label="Academic session" value={sessionId} onChange={value => { setSessionId(value); setClassFilter('all'); }} options={sessions.length ? sessions.map(s => ({ value: String(s.id), label: s.name })) : [{ value: '', label: 'Loading sessions…' }]} />
        <ReportFilterSelect label="Month" value={monthFilter} onChange={setMonthFilter} options={MONTHS.map(m => ({ value: m, label: m }))} />
        <ReportFilterSelect label="Grade" value={gradeFilter} onChange={v => { setGradeFilter(v); setClassFilter('all'); }}
          options={[{ value: 'all', label: 'All Grades' }, ...grades.map(g => ({ value: g.name, label: g.name }))]} />
        <ReportFilterSelect label="Class" value={classFilter} onChange={setClassFilter}
          options={[{ value: 'all', label: 'All Classes' }, ...filteredClasses.map(c => ({ value: String(c.id), label: `${c.grade_name} – ${c.section}` }))]} />
      </ReportFilters>

      <ReportTable label="Attendance results" columns={['Grade', 'Present', 'Absent', 'Leave', 'Late', 'Other', 'Recorded Days', 'Attendance']}
        loading={loading && !sessionError} icon={CalendarCheck} empty="No attendance data found"
        rows={rows.map((row) => {
          const percent = row.attendance_pct ?? 0;
          const tone = percent >= 80 ? 'green' : percent >= 60 ? 'amber' : 'red';
          const detail = tone === 'green' ? 'Good' : tone === 'amber' ? 'Average' : 'Poor';
          return {
            key: row.student_id,
            person: <ReportPerson name={row.student_name} admissionNo={row.admission_no} />,
            values: [
              <ReportClass key="grade" grade={row.grade_name} section={row.section} />,
              <span key="present" className="font-semibold text-emerald-600 dark:text-emerald-400">{row.present}</span>,
              <span key="absent" className="font-semibold text-red-600 dark:text-red-400">{row.absent}</span>,
              <span key="leave" className="font-semibold text-amber-700 dark:text-amber-400">{row.leave}</span>,
              row.late, row.other, row.total_days,
              row.attendance_pct === null ? <span key="attendance">Not recorded</span> : <ReportProgress key="attendance" value={`${percent}%`} percent={percent} detail={detail} tone={tone} />,
            ],
          };
        })}
      />
    </ReportPage>
  );
}

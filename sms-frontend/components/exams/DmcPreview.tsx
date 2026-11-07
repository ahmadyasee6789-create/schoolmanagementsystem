'use client';
import { Badge } from '@/components/finance/FinanceUi';
import type { ResultSheet, SavedStudentResult, SavedSubject } from './resultSheet';

function SubjectMarks({ subject }: { subject?: SavedSubject }) {
  if (!subject || subject.obtained_marks === null) return <span className="font-semibold text-amber-700 dark:text-amber-400">Missing</span>;
  return <span className="font-semibold text-slate-700 dark:text-slate-200">
    {subject.obtained_marks}/{subject.total_marks}
    {subject.grade && <span title="Subject grade from the school's configured grade scale" className="ml-2 text-xs text-[#8B6DF2]">Grade: {subject.grade}</span>}
  </span>;
}

function Overall({ student }: { student: SavedStudentResult }) {
  return <>
    <Badge tone={student.result === 'PASSED' ? 'green' : student.result === 'FAILED' ? 'red' : 'slate'}>{student.result}</Badge>
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
      {student.missing_count ? `${student.missing_count} missing` : `${student.percentage}% · Grade: ${student.grade ?? 'Unassigned'}`}
    </p>
  </>;
}

export default function DmcPreview({ sheet }: { sheet: ResultSheet }) {
  return <>
    <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Saved database marks. “Grade” beside a mark is the subject grade; missing marks make the overall result incomplete.</p>
    <div className="grid gap-3 sm:hidden">{sheet.items.map(student => (
      <article key={student.enrollment_id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-sm font-bold text-slate-900 dark:text-slate-50">{student.student_name}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Roll {student.roll_number ?? student.admission_no ?? 'Unassigned'}</p></div>
          <div><Overall student={student} /></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          {student.subjects.map(subject => <div key={subject.paper_id} className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-white/[0.03]">
            <p className="mb-1 text-slate-500 dark:text-slate-400">{subject.subject_name}</p><SubjectMarks subject={subject} />
          </div>)}
        </div>
      </article>
    ))}</div>
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 sm:block">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>
          {['Roll No.', 'Student', ...sheet.columns.map(c => `${c.subject_name} (${c.total_marks})`), 'Overall result'].map((heading, index) => (
            <th key={index} scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{heading}</th>
          ))}
        </tr></thead>
        <tbody>{sheet.items.map(student => <tr key={student.enrollment_id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]">
          <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{student.roll_number ?? student.admission_no ?? 'Unassigned'}</td>
          <th scope="row" className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{student.student_name}</th>
          {sheet.columns.map(column => <td key={column.key} className="px-4 py-3 text-sm"><SubjectMarks subject={student.subjects.find(s => s.key === column.key)} /></td>)}
          <td className="px-4 py-3"><Overall student={student} /></td>
        </tr>)}</tbody>
      </table>
    </div>
  </>;
}

"use client";

import type { KeyboardEvent } from "react";
import { Badge, panelClass, tableHeadClass } from "@/components/finance/FinanceUi";
import { inputClass } from "./ExamUi";
import { resultKey, validMark, type OverallResult } from "./resultEntry";
import { studentIdentifier, studentName, type ExamPaper, type ExamResult, type ResultStudent } from "./types";

type Props = {
  students: ResultStudent[];
  papers: ExamPaper[];
  results: ReadonlyMap<string, ExamResult>;
  drafts: Record<string, string>;
  failures: Record<string, string>;
  evaluations: ReadonlyMap<number, OverallResult>;
  locked: boolean;
  saving: boolean;
  onMarkChange: (paperId: number, enrollmentId: number, mark: string) => void;
};

function moveFocus(event: KeyboardEvent<HTMLInputElement>, row: number, column: number) {
  const offset: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    Enter: [event.shiftKey ? -1 : 1, 0],
  };
  const step = offset[event.key];
  if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const next = event.currentTarget.closest("table")?.querySelector<HTMLInputElement>(
    `input[data-mark-row="${row + step[0]}"][data-mark-column="${column + step[1]}"]`,
  );
  next?.focus();
  next?.select();
}

export default function ClassWiseResultEntry({ students, papers, results, drafts, failures, evaluations, locked, saving, onMarkChange }: Props) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {locked ? "This examination is read-only." : "Use Tab or the arrow keys to move between marks. Press Enter to move down."}
        {" "}Scroll across to see all subjects.
      </p>
      <div className={`${panelClass} overflow-x-auto`} role="region" aria-label="Class marks grid" tabIndex={0}>
        <table className="w-full min-w-max border-separate border-spacing-0 text-left">
          <thead className="bg-slate-50 dark:bg-[#161D2B]">
            <tr>
              <th scope="col" className={`${tableHeadClass} sticky left-0 z-10 bg-slate-50 dark:bg-[#161D2B]`}>Student</th>
              {papers.map((paper) => (
                <th scope="col" key={paper.id} className={tableHeadClass}>
                  {paper.subject_name}
                  <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal">
                    Out of {paper.total_marks} · Pass {paper.pass_marks}
                  </span>
                </th>
              ))}
              <th scope="col" className={tableHeadClass}>Saved overall</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, row) => {
              const missing = papers.filter((paper) => !results.has(resultKey(paper.id, student.enrollment_id))).length;
              const overall = evaluations.get(student.id);
              return (
                <tr key={student.enrollment_id} className="group">
                  <th scope="row" className="sticky left-0 z-10 max-w-44 min-w-32 border-t border-slate-100 bg-white px-4 py-3 align-top group-hover:bg-slate-50 dark:border-white/5 dark:bg-[#0D1117] dark:group-hover:bg-[#161D2B]">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{studentName(student)}</span>
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{studentIdentifier(student)}</span>
                  </th>
                  {papers.map((paper, column) => {
                    const key = resultKey(paper.id, student.enrollment_id);
                    const saved = results.get(key);
                    const draft = drafts[key];
                    const value = draft ?? (saved ? String(saved.obtained_marks) : "");
                    const error = failures[key] || (draft !== undefined && !validMark(draft, paper.total_marks) ? `Enter a whole number from 0 to ${paper.total_marks}` : "");
                    const hint = error || (value === "" ? "Missing" : draft !== undefined ? "Unsaved" : "");
                    return (
                      <td key={paper.id} className="min-w-32 border-t border-slate-100 px-4 py-3 align-top group-hover:bg-slate-50 dark:border-white/5 dark:group-hover:bg-white/[0.02]">
                        {locked ? (
                          <span className={saved ? "text-sm font-semibold" : "text-sm font-semibold text-amber-700 dark:text-amber-400"}>
                            {saved ? saved.obtained_marks : "Missing"}
                          </span>
                        ) : (
                          <>
                            <input
                              aria-label={`${studentName(student)}: ${paper.subject_name}`}
                              aria-invalid={Boolean(error)}
                              aria-describedby={hint ? `mark-hint-${key}` : undefined}
                              data-mark-row={row}
                              data-mark-column={column}
                              inputMode="numeric"
                              value={value}
                              placeholder="Missing"
                              disabled={saving}
                              onChange={(event) => onMarkChange(paper.id, student.enrollment_id, event.target.value)}
                              onKeyDown={(event) => moveFocus(event, row, column)}
                              className={`${inputClass} w-24 scroll-ml-44 ${error ? "border-red-400 dark:border-red-400/70" : ""}`}
                            />
                            {hint && <p id={`mark-hint-${key}`} className={`mt-1 max-w-32 text-xs ${error ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>{hint}</p>}
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-t border-slate-100 px-4 py-3 align-top dark:border-white/5">
                    {missing ? <Badge tone="slate">{missing} missing</Badge> : overall ? (
                      <>
                        <Badge tone={overall.result === "PASSED" ? "green" : "red"}>{overall.result === "PASSED" ? "Passed" : "Failed"}</Badge>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{overall.percentage}% · {overall.failed_count} failed</p>
                      </>
                    ) : <span className="text-xs text-slate-500 dark:text-slate-400">Awaiting evaluation</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

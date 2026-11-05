"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, FileText, GraduationCap, Lock, Save, Search, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { LabeledField, panelClass } from "@/components/finance/FinanceUi";
import ClassWiseResultEntry from "./ClassWiseResultEntry";
import ResultEntryTable from "./ResultEntryTable";
import { EmptyState, LoadingState, PageHeader, StatGrid, inputClass, primaryButtonClass, secondaryButtonClass } from "./ExamUi";
import { resultKey, validMark, type OverallResult } from "./resultEntry";
import { studentName, type ApiError, type Exam, type ExamPaper, type ExamResult, type ResultStudent } from "./types";

const tabs = [{ id: "by-class", label: "By Class" }, { id: "by-subject", label: "By Subject" }] as const;
type ViewMode = typeof tabs[number]["id"];
type BulkResponse = {
  succeeded: ExamResult[];
  failed: { exam_paper_id: number; student_enrollment_id: number; error: string }[];
};
type EvaluationResponse = { passed_students: OverallResult[]; failed_students: OverallResult[] };

function loadDrafts(key: string): Record<string, string> {
  try {
    const drafts: unknown = JSON.parse(sessionStorage.getItem(key) ?? "{}");
    if (!drafts || typeof drafts !== "object") return {};
    return Object.fromEntries(Object.entries(drafts).filter(([cell, mark]) => /^\d+:\d+$/.test(cell) && typeof mark === "string"));
  } catch {
    return {};
  }
}

export default function ExamResultsWorkspace({ scope }: { scope: string }) {
  const queryClient = useQueryClient();
  const storageKey = `exam-result-drafts:${scope}`;
  const [viewMode, setViewMode] = useState<ViewMode>("by-class");
  const [examId, setExamId] = useState(0);
  const [classId, setClassId] = useState(0);
  const [paperId, setPaperId] = useState(0);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadDrafts(storageKey));
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const dirtyCount = Object.keys(drafts).length;
  useEffect(() => {
    try {
      if (dirtyCount) sessionStorage.setItem(storageKey, JSON.stringify(drafts));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // In-memory drafts are still available if the browser disables storage.
    }
  }, [drafts, dirtyCount, storageKey]);
  useEffect(() => {
    if (!dirtyCount) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyCount]);

  const setupQuery = useQuery({
    queryKey: ["exam-entry", scope, "setup"],
    queryFn: async ({ signal }) => {
      const [exams, papers] = await Promise.all([
        api.get<Exam[]>("/exams", { signal }),
        api.get<ExamPaper[]>("/exam-papers", { signal }),
      ]);
      return { exams: exams.data, papers: papers.data };
    },
  });
  const byClass = viewMode === "by-class";
  const exams = setupQuery.data?.exams ?? [];
  const papers = setupQuery.data?.papers.filter((paper) => paper.exam_id === examId) ?? [];
  const selectedExam = exams.find((exam) => exam.id === examId);
  const currentPaper = papers.find((paper) => paper.id === paperId);
  const classroom = byClass ? classId : currentPaper?.classroom_id ?? 0;
  const classes = new Map(papers.map((paper) => [paper.classroom_id, paper.classroom_name]));
  const locked = Boolean(selectedExam?.is_locked || selectedExam?.is_published);
  const visiblePapers = byClass ? papers.filter((paper) => paper.classroom_id === classId) : currentPaper ? [currentPaper] : [];

  const resultsKey = ["exam-entry", scope, "results", examId];
  const evaluationKey = ["exam-entry", scope, "evaluation", examId];
  const resultsQuery = useQuery({
    queryKey: resultsKey, enabled: examId > 0,
    queryFn: async ({ signal }) => (await api.get<ExamResult[]>(`/exam-results/exam/${examId}`, { signal })).data,
  });
  const studentsQuery = useQuery({
    queryKey: ["exam-entry", scope, "students", classroom], enabled: classroom > 0,
    queryFn: async ({ signal }) => (await api.get<ResultStudent[]>(`/students/by-class/${classroom}`, { signal })).data,
  });
  const results = useMemo(() => new Map(resultsQuery.data?.map((result) =>
    [resultKey(result.exam_paper_id, result.student_enrollment_id), result])), [resultsQuery.data]);
  const students = studentsQuery.data ?? [];
  const evaluationQuery = useQuery({
    queryKey: [...evaluationKey, classId],
    enabled: byClass && visiblePapers.length > 0 && students.some((student) =>
      visiblePapers.every((paper) => results.has(resultKey(paper.id, student.enrollment_id)))),
    queryFn: async ({ signal }) => (await api.get<EvaluationResponse>(`/promotion/preview/${classId}`, {
      params: { exam_id: examId }, signal,
    })).data,
  });
  const evaluations = new Map([
    ...(evaluationQuery.data?.passed_students ?? []), ...(evaluationQuery.data?.failed_students ?? []),
  ].map((evaluation) => [evaluation.student_id, evaluation]));

  const searchTerm = search.trim().toLowerCase();
  const filteredStudents = students.filter((student) =>
    studentName(student).toLowerCase().includes(searchTerm) ||
    (student.admission_no ?? "").toLowerCase().includes(searchTerm));
  const paperResults = resultsQuery.data?.filter((result) => result.exam_paper_id === paperId) ?? [];
  const subjectDrafts: Record<number, string> = {};
  const pending: { key: string; paper: ExamPaper; enrollment: number; mark: string }[] = [];
  for (const paper of visiblePapers) {
    for (const { enrollment_id: enrollment } of students) {
      const key = resultKey(paper.id, enrollment);
      if (drafts[key] === undefined) continue;
      pending.push({ key, paper, enrollment, mark: drafts[key] });
      if (!byClass) subjectDrafts[enrollment] = drafts[key];
    }
  }
  const subjectFailure = pending.map(({ key }) => failures[key]).find(Boolean);

  function selectExam(id: number) {
    setExamId(id);
    setClassId(0);
    setPaperId(0);
    setSearch("");
  }

  function updateMark(paper: number, enrollment: number, mark: string) {
    const key = resultKey(paper, enrollment);
    const saved = results.get(key);
    setDrafts((current) => {
      const next = { ...current };
      if (mark === (saved ? String(saved.obtained_marks) : "")) delete next[key];
      else next[key] = mark;
      return next;
    });
    setFailures((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function discardEdits() {
    if (!window.confirm("Discard unsaved marks in this selection?")) return;
    const keys = new Set(pending.map(({ key }) => key));
    const keep = (current: Record<string, string>) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !keys.has(key)));
    setDrafts(keep);
    setFailures(keep);
  }

  async function saveAll() {
    if (inFlight.current || locked || !selectedExam || !resultsQuery.isSuccess || !studentsQuery.isSuccess) return;
    const valid = pending.filter(({ mark, paper }) => validMark(mark, paper.total_marks));
    if (!valid.length) {
      toast.error("Enter valid whole-number marks before saving. Blank entries do not delete saved results.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const { data } = await api.post<BulkResponse>("/exam-results/bulk", valid.map(({ paper, enrollment, mark }) => ({
        exam_paper_id: paper.id, student_enrollment_id: enrollment, obtained_marks: Number(mark),
      })));
      const submitted = new Map(valid.map(({ key, mark }) => [key, mark]));
      const saved = new Map(data.succeeded.map((result) =>
        [resultKey(result.exam_paper_id, result.student_enrollment_id), result]));
      await queryClient.cancelQueries({ queryKey: resultsKey, exact: true });
      queryClient.setQueryData<ExamResult[]>(resultsKey, (current) => [
        ...(current ?? []).filter((result) => !saved.has(resultKey(result.exam_paper_id, result.student_enrollment_id))),
        ...saved.values(),
      ]);
      setDrafts((current) => {
        const next = { ...current };
        for (const key of saved.keys()) {
          if (next[key] === submitted.get(key)) delete next[key];
        }
        return next;
      });
      setFailures((current) => {
        const next = { ...current };
        for (const key of saved.keys()) delete next[key];
        for (const row of data.failed) next[resultKey(row.exam_paper_id, row.student_enrollment_id)] = row.error;
        return next;
      });
      if (saved.size) {
        toast.success(`${saved.size} ${saved.size === 1 ? "mark" : "marks"} saved`);
        void queryClient.invalidateQueries({ queryKey: evaluationKey });
      }
      if (saved.size < pending.length) toast.error(`${pending.length - saved.size} unsaved marks kept for review`);
      if (data.failed.some((row) => /locked|published/i.test(row.error))) void setupQuery.refetch();
    } catch (error) {
      const detail = (error as ApiError).response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Could not confirm the save. Your edits are still available.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function changeView(view: ViewMode) {
    setViewMode(view);
    setSearch("");
  }

  return (
    <div className="min-h-full min-w-0 bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader title="Exam Results" subtitle="Enter and review marks by class or by subject" />
      <div role="tablist" aria-label="Marks entry view" className="mb-6 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
        {tabs.map(({ id, label }, index) => (
          <button key={id} id={`entry-tab-${id}`} type="button" role="tab" aria-selected={viewMode === id}
            aria-controls="marks-entry-panel" tabIndex={viewMode === id ? 0 : -1} disabled={saving}
            onClick={() => changeView(id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + 1) % tabs.length;
              document.getElementById(`entry-tab-${tabs[next].id}`)?.focus();
              changeView(tabs[next].id);
            }}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${viewMode === id
              ? "bg-[#8B6DF2] text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}>
            {label}
          </button>
        ))}
      </div>
      <section role="tabpanel" id="marks-entry-panel" aria-labelledby={`entry-tab-${viewMode}`}>
        {setupQuery.isPending ? <LoadingState /> : setupQuery.isError ? (
          <EmptyState icon={ClipboardList} message="Failed to load exams and papers" actionLabel="Retry" onAction={() => void setupQuery.refetch()} />
        ) : (
          <>
            <div className={`${panelClass} mb-6 p-4 sm:p-5`}>
              <h2 className="mb-4 text-sm font-bold text-slate-900 dark:text-slate-50">{byClass ? "Select Exam & Class" : "Select Exam & Paper"}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <LabeledField label="Exam">
                  <select aria-label="Exam" value={examId} disabled={saving} onChange={(event) => selectExam(Number(event.target.value))} className={inputClass}>
                    <option value={0} disabled>Choose an exam</option>
                    {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}{exam.is_locked ? " · Locked" : ""}</option>)}
                  </select>
                </LabeledField>
                {byClass ? (
                  <LabeledField label="Classroom">
                    <select aria-label="Classroom" value={classId} disabled={!examId || saving} className={inputClass}
                      onChange={(event) => { setClassId(Number(event.target.value)); setSearch(""); }}>
                      <option value={0} disabled>{examId ? "Choose a class" : "Choose an exam first"}</option>
                      {[...classes].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </LabeledField>
                ) : (
                  <LabeledField label="Subject / Class">
                    <select aria-label="Subject / Class" value={paperId} disabled={!examId || saving} className={inputClass}
                      onChange={(event) => { setPaperId(Number(event.target.value)); setSearch(""); }}>
                      <option value={0} disabled>{examId ? "Choose a subject and class" : "Choose an exam first"}</option>
                      {papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.subject_name} — {paper.classroom_name}</option>)}
                    </select>
                  </LabeledField>
                )}
              </div>
              {locked && <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400"><Lock size={14} />Exam locked or published. An administrator must reopen it before corrections.</p>}
              {dirtyCount > 0 && <p role="status" className="mt-4 text-xs font-semibold text-amber-700 dark:text-amber-400">{dirtyCount} unsaved {dirtyCount === 1 ? "mark" : "marks"} across your selections</p>}
            </div>
            {!visiblePapers.length ? (
              <EmptyState icon={ClipboardList} message={!examId ? "Select an exam to begin" : !papers.length
                ? "No exam papers are set up for this exam yet"
                : byClass ? "Select a classroom to enter marks" : "Select a subject and class to enter marks"} />
            ) : resultsQuery.isError || studentsQuery.isError ? (
              <EmptyState icon={ClipboardList} message="Could not load students or saved marks" actionLabel="Retry" onAction={() => {
                if (resultsQuery.isError) void resultsQuery.refetch();
                if (studentsQuery.isError) void studentsQuery.refetch();
              }} />
            ) : resultsQuery.isPending || studentsQuery.isPending ? <LoadingState /> : (
              <>
                {!byClass && currentPaper && <SubjectStats paper={currentPaper} results={paperResults} studentCount={students.length} />}
                <div className="mb-4 flex flex-wrap gap-3">
                  <div className="relative min-w-48 flex-1">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input aria-label="Search students" value={search} onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search students…" className={`${inputClass} pl-9`} />
                  </div>
                  {pending.length > 0 && <button type="button" disabled={saving} onClick={discardEdits} className={secondaryButtonClass}>Discard edits</button>}
                  {!locked && (
                    <button type="button" onClick={() => void saveAll()} disabled={saving || !pending.length}
                      className={`${primaryButtonClass} inline-flex items-center gap-2`}>
                      <Save size={16} />{saving ? "Saving…" : `Save All${pending.length ? ` (${pending.length})` : ""}`}
                    </button>
                  )}
                </div>
                {evaluationQuery.isError && byClass && (
                  <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                    Overall results could not load. <button type="button" className="underline" onClick={() => void evaluationQuery.refetch()}>Retry evaluation</button>
                  </p>
                )}
                {!byClass && subjectFailure && (
                  <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{subjectFailure} The unsaved marks are still available.</p>
                )}
                {!filteredStudents.length ? (
                  <EmptyState icon={UserRound} message={searchTerm ? "No students match your search" : "No students found for this class"} />
                ) : byClass ? (
                  <ClassWiseResultEntry students={filteredStudents} papers={visiblePapers} results={results}
                    drafts={drafts} failures={failures} evaluations={evaluations} locked={locked} saving={saving} onMarkChange={updateMark} />
                ) : currentPaper && (
                  <fieldset disabled={saving}>
                    <ResultEntryTable students={filteredStudents} paper={currentPaper} results={paperResults}
                      localMarks={subjectDrafts} locked={locked}
                      onMarkChange={(enrollment, mark) => updateMark(currentPaper.id, enrollment, mark)} />
                  </fieldset>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SubjectStats({ paper, results, studentCount }: { paper: ExamPaper; results: ExamResult[]; studentCount: number }) {
  const average = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.obtained_marks, 0) / Math.max(paper.total_marks, 1) / results.length * 100)
    : 0;
  return (
    <>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Total marks {paper.total_marks} · Pass marks {paper.pass_marks} · {studentCount} students</p>
      {results.length > 0 && (
        <StatGrid stats={[
          { label: "Entered", value: results.length, Icon: FileText, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" },
          { label: "Passing", value: results.filter((result) => result.obtained_marks >= paper.pass_marks).length, Icon: CheckCircle2, tone: "border-emerald-400/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
          { label: "Graded", value: results.filter((result) => result.grade).length, Icon: GraduationCap, tone: "border-blue-400/20 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
          { label: "Avg Score", value: `${average}%`, Icon: ClipboardList, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" },
        ]} />
      )}
    </>
  );
}

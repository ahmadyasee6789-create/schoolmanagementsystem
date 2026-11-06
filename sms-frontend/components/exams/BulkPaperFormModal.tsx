"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import { Modal, inputClass, primaryButtonClass, secondaryButtonClass } from "./ExamUi";
import { classroomLabel, type Classroom, type Exam, type ExamPaper } from "./types";

type Assignment = { classroom_id: number; subject_id: number; subject_name: string | null };
type Draft = { selected: boolean; total: string; pass: string };
type BulkPaperRequest = { exam_id: number; classroom_id: number; papers: { subject_id: number; total_marks: number; pass_marks: number }[] };
export type BulkPaperCreateResult = { created_count: number; skipped_count: number; created: ExamPaper[]; skipped: ExamPaper[] };
type Preview = { request: BulkPaperRequest; examName: string; className: string; rows: { subjectId: number; name: string; total: number; pass: number; exists: boolean }[] };

const blankDraft: Draft = { selected: false, total: "", pass: "" };

function errorMessage(error: unknown) {
  if (isAxiosError<{ detail?: string | { msg?: string }[] }>(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((issue) => issue.msg || "Invalid paper details").join("; ");
  }
  return "Unable to create the papers. Your selections have been kept. Please try again.";
}

export default function BulkPaperFormModal({ exams, classrooms, papers, onClose, onCreated }: {
  exams: Exam[]; classrooms: Classroom[]; papers: ExamPaper[]; onClose: () => void;
  onCreated: (result: BulkPaperCreateResult) => Promise<void>;
}) {
  const user = useAuthStore((state) => state.user);
  const [examId, setExamId] = useState(0);
  const [classroomId, setClassroomId] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const inFlight = useRef(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const assignments = useQuery({
    queryKey: ["exam-paper-assignments", user?.org_id, user?.id],
    enabled: user?.org_role === "admin",
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<Assignment[]>("/subjects/assignments", { signal });
      return Array.isArray(data) ? data : [];
    },
  });
  const exam = exams.find((item) => item.id === examId);
  const classroom = classrooms.find((item) => item.id === classroomId);
  const protectedExam = !!exam && (exam.is_locked || exam.is_published);
  const uniqueSubjects = new Map((assignments.data ?? []).filter((item) => item.classroom_id === classroomId).map((item) => [item.subject_id, item]));
  const rows = Array.from(uniqueSubjects.values()).map((assignment) => {
    const key = `${classroomId}-${assignment.subject_id}`;
    const draft = drafts[key] ?? blankDraft;
    const existing = papers.find((paper) => paper.exam_id === examId && paper.classroom_id === classroomId && paper.subject_id === assignment.subject_id);
    return { key, subjectId: assignment.subject_id, name: assignment.subject_name || `Subject ${assignment.subject_id}`, ...draft,
      total: existing ? String(existing.total_marks) : draft.total, pass: existing ? String(existing.pass_marks) : draft.pass, existing };
  });
  const dirty = Object.values(drafts).some((draft) => draft.selected || draft.total !== "" || draft.pass !== "");
  const selectedCount = rows.filter((row) => row.selected).length;

  useEffect(() => {
    if (preview) confirmButton.current?.focus();
  }, [preview]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function requestClose() {
    if (inFlight.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  function changeDraft(key: string, changes: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? blankDraft), ...changes } }));
    setErrors({});
    setMessage("");
  }
  function selectAll(selected: boolean) {
    setDrafts((current) => {
      const updated = { ...current };
      for (const row of rows) updated[row.key] = { ...(current[row.key] ?? blankDraft), selected };
      return updated;
    });
    setErrors({});
    setMessage("");
  }
  function preparePreview() {
    if (saving || preview) return;
    const issues: Record<string, string> = {};
    if (!exam || protectedExam) issues.examination = "Choose an unlocked, unpublished examination.";
    if (!classroom) issues.classroom = "Choose a classroom.";
    if (!selectedCount) issues.subjects = "Select at least one assigned subject.";
    const selected = rows.filter((row) => row.selected);
    for (const row of selected) {
      if (!/^\d+$/.test(row.total) || !Number.isSafeInteger(Number(row.total)) || Number(row.total) <= 0) issues[`total-${row.subjectId}`] = "Total marks must be a whole number greater than zero.";
      if (!/^\d+$/.test(row.pass) || !Number.isSafeInteger(Number(row.pass)) || Number(row.pass) < 0 || Number(row.pass) > Number(row.total)) issues[`pass-${row.subjectId}`] = "Pass marks must be a whole number between zero and total marks.";
    }
    setErrors(issues);
    if (Object.keys(issues).length) {
      setMessage("Please correct the highlighted fields before previewing.");
      const first = formRef.current?.elements.namedItem(Object.keys(issues)[0]);
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    setMessage("");
    setPreview({
      request: { exam_id: examId, classroom_id: classroomId, papers: selected.map((row) => ({ subject_id: row.subjectId, total_marks: Number(row.total), pass_marks: Number(row.pass) })) },
      examName: exam!.name, className: classroomLabel(classroom!),
      rows: selected.map((row) => ({ subjectId: row.subjectId, name: row.name, total: Number(row.total), pass: Number(row.pass), exists: !!row.existing })),
    });
  }
  async function createPapers() {
    if (!preview || inFlight.current) return;
    if (user?.org_role !== "admin") { setMessage("Only school administrators can add multiple papers."); return; }
    inFlight.current = true;
    setSaving(true);
    setMessage("");
    try {
      const { data } = await api.post<BulkPaperCreateResult>("/exam-papers/bulk", preview.request);
      await onCreated(data);
      onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      setPreview(null);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <Modal title="Add Multiple Papers" onClose={requestClose} size="md" busy={saving}>
    <form ref={formRef} noValidate aria-busy={saving} onSubmit={(event) => { event.preventDefault(); preparePreview(); }}>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Select the examination, classroom, and assigned subjects. Review the papers before creating them.</p>
      {message && <p role="alert" className="mb-4 rounded-lg border border-red-300/30 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400">{message}</p>}
      <fieldset disabled={saving || !!preview} className="min-w-0 space-y-5 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Examination
            <select name="examination" aria-label="Examination" value={examId} onChange={(event) => { setExamId(Number(event.target.value)); setErrors({}); setMessage(""); }} className={`${inputClass} mt-1.5`} aria-invalid={!!errors.examination} aria-describedby={errors.examination ? "bulk-examination-error" : undefined}>
              <option value={0}>Select examination</option>
              {exams.map((item) => <option key={item.id} value={item.id} disabled={item.is_locked || item.is_published}>{item.name}{item.is_locked || item.is_published ? " (locked or published)" : ""}</option>)}
            </select>
            {errors.examination && <span id="bulk-examination-error" className="mt-1 block text-red-600 dark:text-red-400">{errors.examination}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Classroom
            <select name="classroom" aria-label="Classroom" value={classroomId} onChange={(event) => { setClassroomId(Number(event.target.value)); setErrors({}); setMessage(""); }} className={`${inputClass} mt-1.5`} aria-invalid={!!errors.classroom} aria-describedby={errors.classroom ? "bulk-classroom-error" : undefined}>
              <option value={0}>Select classroom</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{classroomLabel(item)}</option>)}
            </select>
            {errors.classroom && <span id="bulk-classroom-error" className="mt-1 block text-red-600 dark:text-red-400">{errors.classroom}</span>}
          </label>
        </div>
        {protectedExam && <p className="text-sm text-amber-700 dark:text-amber-400">This examination must be reopened by an administrator before papers can be added.</p>}
        {assignments.isPending ? <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Loading assigned subjects…</p> : assignments.isError ? <div className="rounded-lg border border-red-300/30 p-3 text-sm text-red-600 dark:text-red-400"><p>Unable to load assigned subjects.</p><button type="button" onClick={() => void assignments.refetch()} className={`${secondaryButtonClass} mt-2`}>Retry subjects</button></div> : !classroomId ? <p className="text-sm text-slate-500 dark:text-slate-400">Choose a classroom to see its assigned subjects.</p> : !rows.length ? <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">No subjects are assigned to this classroom. Assign its subjects before adding papers.</p> : <section aria-label="Assigned subjects">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{selectedCount} of {rows.length} subjects selected</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => selectAll(true)} className={secondaryButtonClass}>Select All</button><button type="button" onClick={() => selectAll(false)} className={secondaryButtonClass}>Deselect All</button></div></div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Enter total and pass marks for each selected subject. Existing papers are skipped without changes.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[520px] text-left"><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Subject", "Total marks", "Pass marks"].map((heading) => <th key={heading} className="px-3 py-3 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.subjectId} className="border-t border-slate-100 dark:border-white/10">
            <td className="px-3 py-3"><label className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200"><input type="checkbox" aria-label={`Select ${row.name}`} checked={row.selected} onChange={(event) => changeDraft(row.key, { selected: event.target.checked })} className="h-4 w-4 shrink-0 accent-[#8B6DF2]" />{row.name}</label>{row.existing && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Already exists · will be skipped</span>}</td>
            <td className="px-3 py-3 align-top"><input name={`total-${row.subjectId}`} aria-label={`Total marks for ${row.name}`} type="number" min={1} step={1} value={row.total} readOnly={!!row.existing} disabled={!row.selected} onChange={(event) => changeDraft(row.key, { total: event.target.value })} className={`${inputClass} min-w-24`} aria-invalid={!!errors[`total-${row.subjectId}`]} aria-describedby={errors[`total-${row.subjectId}`] ? `bulk-total-${row.subjectId}-error` : undefined} />{errors[`total-${row.subjectId}`] && <p id={`bulk-total-${row.subjectId}-error`} className="mt-1 max-w-36 text-xs text-red-600 dark:text-red-400">{errors[`total-${row.subjectId}`]}</p>}</td>
            <td className="px-3 py-3 align-top"><input name={`pass-${row.subjectId}`} aria-label={`Pass marks for ${row.name}`} type="number" min={0} max={row.total || undefined} step={1} value={row.pass} readOnly={!!row.existing} disabled={!row.selected} onChange={(event) => changeDraft(row.key, { pass: event.target.value })} className={`${inputClass} min-w-24`} aria-invalid={!!errors[`pass-${row.subjectId}`]} aria-describedby={errors[`pass-${row.subjectId}`] ? `bulk-pass-${row.subjectId}-error` : undefined} />{errors[`pass-${row.subjectId}`] && <p id={`bulk-pass-${row.subjectId}-error`} className="mt-1 max-w-36 text-xs text-red-600 dark:text-red-400">{errors[`pass-${row.subjectId}`]}</p>}</td>
          </tr>)}</tbody></table></div>
          {errors.subjects && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.subjects}</p>}
        </section>}
      </fieldset>
      {preview && <section role="region" aria-label="Paper creation preview" className="mt-5 rounded-xl border border-[#8B6DF2]/25 bg-[#8B6DF2]/5 p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Paper creation preview</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{preview.examName} · {preview.className}</p>
        <p className="mt-2 text-sm font-semibold text-[#8B6DF2]">{preview.rows.filter((row) => !row.exists).length} to create · {preview.rows.filter((row) => row.exists).length} already existing to skip</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">{preview.rows.map((row) => <li key={row.subjectId} className="flex flex-wrap justify-between gap-x-3"><span>{row.name}{row.exists ? " · Skip existing" : ""}</span><span>Total {row.total} · Pass {row.pass}</span></li>)}</ul>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">The server checks assignments and exam status again. Papers created in the meantime will also be skipped.</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPreview(null)} disabled={saving} className={secondaryButtonClass}>Back to editing</button><button ref={confirmButton} type="button" onClick={() => void createPapers()} disabled={saving} className={primaryButtonClass}>{saving ? "Creating…" : "Confirm and Create"}</button></div>
      </section>}
      <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={requestClose} disabled={saving} className={secondaryButtonClass}>Cancel</button>{!preview && <button type="submit" disabled={saving || assignments.isPending || assignments.isError || !examId || !classroomId || protectedExam || !selectedCount} className={primaryButtonClass}>Preview Papers</button>}</div>
    </form>
    {discard && <Modal title="Discard unsaved papers?" onClose={() => setDiscard(false)}><p className="text-sm text-slate-500 dark:text-slate-400">Your selections and marks have not been saved.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setDiscard(false)} className={secondaryButtonClass}>Keep editing</button><button type="button" onClick={onClose} className={primaryButtonClass}>Discard papers</button></div></Modal>}
  </Modal>;
}

"use client";

import { useRef, useState } from "react";
import { api } from "@/app/lib/api";
import { subjectError, subjectNameKey, type BulkAssignmentResult, type BulkSubjectsResult, type Subject, type SubjectAssignment, type SubjectClassroom } from "@/app/lib/subjects";
import { Modal, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";

function Notice({ children }: { children: string }) {
  return <p role="alert" className="mb-4 rounded-lg border border-red-300/30 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400">{children}</p>;
}

export function BulkAddSubjectsDialog({ subjects, onClose, onSaved }: {
  subjects: Subject[]; onClose: () => void; onSaved: (result: BulkSubjectsResult) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const names = text.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  const existing = new Set(subjects.map((subject) => subjectNameKey(subject.name)));
  const seen = new Set<string>();
  const rows = names.map((name) => {
    const key = subjectNameKey(name);
    const reason = seen.has(key) ? "Duplicate in this list" : existing.has(key) ? "Already exists" : "Create";
    seen.add(key);
    return { name, reason };
  });
  const newCount = rows.filter((row) => row.reason === "Create").length;
  function close() {
    if (!inFlight.current && (!text.trim() || window.confirm("Discard these unsaved subject names?"))) onClose();
  }
  function review() {
    if (!names.length || names.length > 500 || names.some((name) => Array.from(name).length > 100)) {
      setError("Enter 1–500 subject names, with no more than 100 characters in each name.");
      return;
    }
    setError("");
    setPreview(true);
  }
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError("");
    try {
      const { data } = await api.post<BulkSubjectsResult>("/subjects/bulk", { names }, { timeout: 45_000 });
      await onSaved(data);
      onClose();
    } catch (cause) {
      setError(subjectError(cause));
    } finally { inFlight.current = false; setSaving(false); }
  }
  return <Modal title="Add Multiple Subjects" onClose={close} size="md" busy={saving}>
    <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Enter one subject name per line for the active academic session.</p>
    {error && <Notice>{error}</Notice>}
    {!preview ? <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Subject names
      <textarea autoFocus aria-label="Subject names" rows={9} value={text} onChange={(event) => setText(event.target.value)} className={`${inputClass} mt-1.5 resize-y`} placeholder={"Mathematics\nEnglish\nScience"} />
    </label> : <section aria-label="Subject creation preview">
      <p className="mb-3 text-sm font-semibold text-[#8B6DF2]">{newCount} to create · {rows.length - newCount} to skip</p>
      <div className="max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400"><tr><th className="p-3">Subject</th><th className="p-3">Action</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-slate-100 dark:border-white/10"><td className="break-all p-3 text-slate-900 dark:text-slate-100">{row.name}</td><td className="p-3 text-slate-500 dark:text-slate-400">{row.reason}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Existing subjects stay unchanged. The server checks duplicates again before saving.</p>
    </section>}
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <button type="button" onClick={close} disabled={saving} className={secondaryButtonClass}>Cancel</button>
      {preview ? <><button type="button" onClick={() => { setPreview(false); setError(""); }} disabled={saving} className={secondaryButtonClass}>Back to editing</button><button type="button" onClick={() => void save()} disabled={saving} className={primaryButtonClass}>{saving ? "Saving…" : "Confirm and Save"}</button></> : <button type="button" onClick={review} className={primaryButtonClass}>Preview Subjects</button>}
    </div>
  </Modal>;
}

export function BulkAssignSubjectsDialog({ subjects, classrooms, assignments, onClose, onSaved }: {
  subjects: Subject[]; classrooms: SubjectClassroom[]; assignments: SubjectAssignment[];
  onClose: () => void; onSaved: (result: BulkAssignmentResult) => Promise<void>;
}) {
  const [classId, setClassId] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const assigned = new Set(assignments.filter((item) => item.classroom_id === classId).map((item) => item.subject_id));
  const skipped = [...selected].filter((id) => assigned.has(id)).length;
  const classroom = classrooms.find((item) => item.id === classId);
  function close() {
    if (!inFlight.current && (!selected.size || window.confirm("Discard these unsaved subject selections?"))) onClose();
  }
  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError("");
    try {
      const { data } = await api.post<BulkAssignmentResult>("/subjects/assign-to-class/bulk", { classroom_id: classId, subject_ids: [...selected] }, { timeout: 45_000 });
      await onSaved(data);
      onClose();
    } catch (cause) { setError(subjectError(cause)); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <Modal title="Assign Multiple Subjects" onClose={close} size="md" busy={saving}>
    <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Assign subjects in the active academic session. Existing assignments and teachers are preserved.</p>
    {error && <Notice>{error}</Notice>}
    <fieldset disabled={saving || preview} className="min-w-0">
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Classroom
        <select aria-label="Classroom" value={classId} onChange={(event) => { setClassId(Number(event.target.value)); setSelected(new Set()); }} className={`${inputClass} mt-1.5`}>
          <option value={0}>Select classroom</option>{classrooms.map((item) => <option key={item.id} value={item.id}>{item.grade_name ?? item.class_name} · {item.section}</option>)}
        </select>
      </label>
      {classId > 0 && <>
        <div className="my-4 flex flex-wrap gap-2"><button type="button" onClick={() => setSelected(new Set(subjects.map((item) => item.id)))} className={secondaryButtonClass}>Select All</button><button type="button" onClick={() => setSelected(new Set())} className={secondaryButtonClass}>Deselect All</button></div>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3 dark:border-white/10">{subjects.length ? subjects.map((subject) => <label key={subject.id} className="flex items-center justify-between gap-3 rounded-lg p-2 text-sm text-slate-800 dark:text-slate-200"><span className="flex min-w-0 items-center gap-2"><input type="checkbox" aria-label={`Select ${subject.name}`} checked={selected.has(subject.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(subject.id); else next.delete(subject.id); return next; })} className="h-4 w-4 shrink-0 accent-[#8B6DF2]" /><span className="break-words">{subject.name}</span></span>{assigned.has(subject.id) && <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">Already assigned · Skip</span>}</label>) : <p className="text-sm text-slate-500">No subjects are available. Add subjects first.</p>}</div>
      </>}
    </fieldset>
    {preview && <section aria-label="Subject assignment preview" className="mt-4 rounded-xl border border-[#8B6DF2]/25 bg-[#8B6DF2]/5 p-4 text-sm">
      <p className="font-semibold text-slate-900 dark:text-slate-100">{classroom?.grade_name ?? classroom?.class_name} · {classroom?.section}</p>
      <p className="mt-2 font-semibold text-[#8B6DF2]">{selected.size - skipped} to assign · {skipped} to skip</p>
      <ul className="mt-3 space-y-1 text-slate-600 dark:text-slate-300">{subjects.filter((item) => selected.has(item.id)).map((item) => <li key={item.id}>{item.name}{assigned.has(item.id) ? " · Skip existing" : ""}</li>)}</ul>
    </section>}
    <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={close} disabled={saving} className={secondaryButtonClass}>Cancel</button>{preview ? <><button type="button" onClick={() => setPreview(false)} disabled={saving} className={secondaryButtonClass}>Back to editing</button><button type="button" onClick={() => void save()} disabled={saving} className={primaryButtonClass}>{saving ? "Assigning…" : "Confirm Assignments"}</button></> : <button type="button" onClick={() => { if (selected.size > 500) setError("Select no more than 500 subjects at once."); else { setError(""); setPreview(true); } }} disabled={!classId || !selected.size} className={primaryButtonClass}>Preview Assignments</button>}</div>
  </Modal>;
}

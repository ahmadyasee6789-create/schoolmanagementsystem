"use client";

import { BookOpen, ClipboardList } from "lucide-react";
import { Modal, inputClass, primaryButtonClass, secondaryButtonClass } from "./ExamUi";
import type { Classroom, Exam, PaperForm, Subject } from "./types";
import { classroomLabel } from "./types";

type PaperFormModalProps = {
  form: PaperForm;
  exams: Exam[];
  classrooms: Classroom[];
  subjects: Subject[];
  editing: boolean;
  saving: boolean;
  onChange: (form: PaperForm) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function PaperFormModal({ form, exams, classrooms, subjects, editing, saving, onChange, onClose, onSave }: PaperFormModalProps) {
  const invalidMarks = form.pass_marks > form.total_marks;
  const passRate = form.total_marks > 0 ? Math.round((form.pass_marks / form.total_marks) * 100) : 0;
  const update = <K extends keyof PaperForm>(key: K, value: PaperForm[K]) => onChange({ ...form, [key]: value });
  const cannotSave = saving || !form.exam_id || !form.classroom_id || !form.subject_id || form.total_marks < 1 || invalidMarks;

  return (
    <Modal title={editing ? "Edit Exam Paper" : "Add Exam Paper"} onClose={onClose} size="md">
      <div className="space-y-6"><section><h3 className="mb-3 flex items-center gap-2 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><ClipboardList size={14} className="text-[#8B6DF2]" />Assignment</h3><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">Exam <span className="text-red-500">*</span><select disabled={editing} value={form.exam_id} onChange={(event) => update("exam_id", Number(event.target.value))} className={`${inputClass} mt-1.5`}><option value={0} disabled>Select exam</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select>{editing && <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">Exam cannot be changed after creation.</span>}</label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Classroom <span className="text-red-500">*</span><select disabled={editing} value={form.classroom_id} onChange={(event) => update("classroom_id", Number(event.target.value))} className={`${inputClass} mt-1.5`}><option value={0} disabled>Select classroom</option>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroomLabel(classroom)}</option>)}</select></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Subject <span className="text-red-500">*</span><select disabled={editing} value={form.subject_id} onChange={(event) => update("subject_id", Number(event.target.value))} className={`${inputClass} mt-1.5`}><option value={0} disabled>Select subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label></div></section>
        <section><h3 className="mb-3 flex items-center gap-2 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><BookOpen size={14} className="text-[#8B6DF2]" />Marks</h3><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Total Marks <span className="text-red-500">*</span><input type="number" min={1} value={form.total_marks} onChange={(event) => update("total_marks", Number(event.target.value))} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Pass Marks <span className="text-red-500">*</span><input type="number" min={0} max={form.total_marks} value={form.pass_marks} onChange={(event) => update("pass_marks", Number(event.target.value))} className={`${inputClass} mt-1.5`} /></label></div><div className="mt-4 flex items-center justify-between rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 p-3"><span className="text-xs text-slate-600 dark:text-slate-300">Pass rate preview</span><span className="text-sm font-bold text-[#8B6DF2]">{form.pass_marks}/{form.total_marks} · {passRate}%</span></div>{invalidMarks && <p className="mt-3 rounded-lg border border-red-400/25 bg-red-50 p-3 text-xs font-medium text-red-500 dark:border-red-400/20 dark:bg-red-500/10">Pass marks cannot exceed total marks.</p>}</section></div>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={onSave} disabled={cannotSave} className={primaryButtonClass}>{saving ? "Saving…" : editing ? "Update Paper" : "Create Paper"}</button></div>
    </Modal>
  );
}

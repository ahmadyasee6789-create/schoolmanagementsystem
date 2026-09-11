"use client";

import { CalendarDays, ClipboardList } from "lucide-react";
import { Modal, inputClass, primaryButtonClass, secondaryButtonClass } from "./ExamUi";
import type { ExamForm, Term } from "./types";

type ExamFormModalProps = {
  form: ExamForm;
  terms: Term[];
  editing: boolean;
  saving: boolean;
  onChange: (form: ExamForm) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function ExamFormModal({ form, terms, editing, saving, onChange, onClose, onSave }: ExamFormModalProps) {
  const invalidDateRange = Boolean(form.start_date && form.end_date && form.start_date >= form.end_date);
  const update = <K extends keyof ExamForm>(key: K, value: ExamForm[K]) => onChange({ ...form, [key]: value });
  const cannotSave = saving || !form.name.trim() || !form.start_date || !form.end_date || !form.term_id || invalidDateRange;

  return (
    <Modal title={editing ? "Edit Exam" : "Schedule New Exam"} onClose={onClose} size="md">
      <div className="space-y-6">
        <section><h3 className="mb-3 flex items-center gap-2 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><ClipboardList size={14} className="text-[#8B6DF2]" />Exam Details</h3><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">Exam Name <span className="text-red-500">*</span><input autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Mid-Term Examination 2025" className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Term <span className="text-red-500">*</span><select value={form.term_id} onChange={(event) => update("term_id", Number(event.target.value))} className={`${inputClass} mt-1.5`}><option value={0} disabled>Select term</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Weightage (0–1)<input type="number" min={0} max={1} step={0.05} value={form.weightage} onChange={(event) => update("weightage", Number(event.target.value))} className={`${inputClass} mt-1.5`} /><span className="mt-1 block text-[11px] font-medium text-[#8B6DF2]">= {(form.weightage * 100).toFixed(0)}% of final grade</span></label></div></section>
        <section><h3 className="mb-3 flex items-center gap-2 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><CalendarDays size={14} className="text-[#8B6DF2]" />Schedule</h3><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Start Date <span className="text-red-500">*</span><input type="date" value={form.start_date} onChange={(event) => update("start_date", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">End Date <span className="text-red-500">*</span><input type="date" value={form.end_date} onChange={(event) => update("end_date", event.target.value)} className={`${inputClass} mt-1.5`} /></label></div>{invalidDateRange && <p className="mt-3 rounded-lg border border-red-400/25 bg-red-50 p-3 text-xs font-medium text-red-500 dark:border-red-400/20 dark:bg-red-500/10">Start date must be before end date.</p>}</section>
        <p className="rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 p-3 text-xs text-[#6D50D6] dark:text-[#B6A5FF]">After creation, publish the exam to make it visible, then lock it once marks have been entered.</p>
      </div>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={onSave} disabled={cannotSave} className={primaryButtonClass}>{saving ? "Saving…" : editing ? "Update Exam" : "Schedule Exam"}</button></div>
    </Modal>
  );
}

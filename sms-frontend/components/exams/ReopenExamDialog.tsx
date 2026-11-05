"use client";

import { useState, type FormEvent } from "react";
import { Modal, inputClass, primaryButtonClass, secondaryButtonClass } from "./ExamUi";
import type { Exam } from "./types";

export default function ReopenExamDialog({ exam, busy, error, onClose, onConfirm }: {
  exam: Exam; busy: boolean; error: string; onClose: () => void; onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!busy && reason.trim()) void onConfirm(reason.trim()); };
  return <Modal title="Reopen Exam" onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">Reopen “{exam.name}” for marks correction? This will unlock and unpublish the examination.</p>
      <p className="rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 p-3 text-sm text-[#6D50D6] dark:text-[#B8A6F7]">An immutable snapshot of the current results, paper definitions, and grading rules will be saved first. Existing marks will be kept.</p>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Reason for reopening <span className="text-red-500">*</span>
        <textarea aria-label="Reason for reopening" autoFocus required maxLength={1000} rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} className={`${inputClass} mt-2`} />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
        <button type="button" disabled={busy} onClick={onClose} className={secondaryButtonClass}>Cancel</button>
        <button type="submit" disabled={busy || !reason.trim()} className={primaryButtonClass}>{busy ? "Saving snapshot…" : "Confirm Reopen"}</button>
      </div>
    </form>
  </Modal>;
}

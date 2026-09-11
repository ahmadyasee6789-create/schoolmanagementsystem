"use client";

import { BookOpen, X } from "lucide-react";

interface AddEditSubjectDialogProps {
  open: boolean;
  onClose: () => void;
  editing: boolean;
  subjectName: string;
  setSubjectName: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}

export default function AddEditSubjectDialog({
  open,
  onClose,
  editing,
  subjectName,
  setSubjectName,
  onSave,
  saving,
}: AddEditSubjectDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subject-dialog-title"
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8B6DF2]/10">
              <BookOpen size={16} className="text-[#8B6DF2]" />
            </div>
            <h2 id="subject-dialog-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
              {editing ? "Edit Subject" : "Add New Subject"}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-slate-300"
          >
            <X size={18} />
          </button>
        </div>

        <label htmlFor="subject-name" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Subject Name <span className="text-red-500">*</span>
        </label>
        <input
          id="subject-name"
          autoFocus
          maxLength={100}
          value={subjectName}
          onChange={(event) => setSubjectName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && subjectName.trim() && !saving) onSave();
          }}
          placeholder="e.g. Mathematics"
          className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />

        <p className="mb-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          Subjects can be assigned to classrooms after they are created.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!subjectName.trim() || saving}
            className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : editing ? "Update Subject" : "Create Subject"}
          </button>
        </div>
      </div>
    </div>
  );
}

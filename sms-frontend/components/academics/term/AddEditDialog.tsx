"use client";

import { Calendar, X } from "lucide-react";

interface AddEditTermDialogProps {
  open: boolean;
  onClose: () => void;
  editing: boolean;
  activeSessionName?: string;
  termName: string;
  setTermName: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}

export default function AddEditTermDialog({
  open,
  onClose,
  editing,
  activeSessionName,
  termName,
  setTermName,
  onSave,
  saving,
}: AddEditTermDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
            {editing ? "Edit Term" : "Add New Term"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
          >
            <X size={18} />
          </button>
        </div>

        {activeSessionName && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-400/25 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <Calendar size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Active Session
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {activeSessionName}
              </p>
            </div>
            <span className="ml-auto whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              Auto-assigned
            </span>
          </div>
        )}

        <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
          Term Name <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          value={termName}
          onChange={(e) => setTermName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && termName.trim()) onSave();
          }}
          placeholder="e.g. Term 1, Mid-Year, Final Term"
          className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />

        <p className="mb-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          💡 This term will be created under the active session. Terms group exams (e.g. midterms, finals).
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!termName.trim() || saving}
            className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : editing ? "Update Term" : "Create Term"}
          </button>
        </div>
      </div>
    </div>
  );
}
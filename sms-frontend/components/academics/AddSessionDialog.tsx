"use client";

import { Calendar, X } from "lucide-react";

interface SessionForm {
  name: string;
  start_date: string;
  end_date: string;
}

export default function AddSessionDialog({
  open,
  onClose,
  form,
  setForm,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  form: SessionForm;
  setForm: (f: SessionForm) => void;
  onSave: () => void;
  saving: boolean;
}) {
  if (!open) return null;

  const canSave = form.name.trim() && form.start_date && form.end_date;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="w-full max-w-xs overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161D2B]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <Calendar size={18} className="text-amber-500" />
            <h2 className="text-[1.05rem] font-bold text-slate-900 dark:text-slate-50">
              Add Academic Session
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 pt-5 pb-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Session Name *
            </label>
            <input
              autoFocus
              placeholder="e.g. 2025 – 2026"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-[#8B6DF2] dark:border-white/10 dark:bg-[#0D1117] dark:text-slate-50"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Start Date *
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-[#8B6DF2] dark:border-white/10 dark:bg-[#0D1117] dark:text-slate-50"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                End Date *
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-[#8B6DF2] dark:border-white/10 dark:bg-[#0D1117] dark:text-slate-50"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !canSave}
            className="rounded-[10px] bg-[#8B6DF2] px-5 py-2 text-sm font-semibold text-[#111827] transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/20 disabled:text-slate-400"
          >
            {saving ? "Creating…" : "Save Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
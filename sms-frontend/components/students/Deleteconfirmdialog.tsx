"use client";

import { AlertTriangle } from "lucide-react";
import { secondaryButtonClass } from "./types";

export default function DeleteConfirmDialog({
  open,
  deleting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-student-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
            <AlertTriangle size={18} className="text-red-500" />
          </span>
          <h2
            id="delete-student-title"
            className="text-base font-bold text-slate-900 dark:text-slate-50"
          >
            Delete student?
          </h2>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          This will permanently delete the student record.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
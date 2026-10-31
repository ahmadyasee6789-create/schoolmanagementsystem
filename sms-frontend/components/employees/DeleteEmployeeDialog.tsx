"use client";

import { AlertTriangle } from "lucide-react";
import { secondaryButtonClass } from "./types.ts";

export default function DeleteEmployeeDialog({
  open,
  employeeName,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  employeeName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-employee-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
            <AlertTriangle size={18} className="text-red-500" />
          </span>
          <h2
            id="delete-employee-title"
            className="text-base font-bold text-slate-900 dark:text-slate-50"
          >
            Delete Employee?
          </h2>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Are you sure you want to delete{" "}
          <span className="font-bold text-slate-900 dark:text-slate-100">
            {employeeName ?? "this employee"}
          </span>
          ? This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400"
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  );
}
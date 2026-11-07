"use client";

import { X } from "lucide-react";
import { EmployeeFormData, inputClass, secondaryButtonClass } from "./types";

export default function EmployeeFormDialog({
  open,
  mode,
  form,
  updateForm,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "add" | "edit";
  form: EmployeeFormData;
  updateForm: (field: keyof EmployeeFormData, value: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-dialog-title"
    >
      <div className="mx-auto my-4 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="employee-dialog-title"
            className="text-base font-bold text-slate-900 dark:text-slate-50"
          >
            {mode === "add" ? "Add New Employee" : "Edit Employee"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
            Full Name <span className="text-red-500">*</span>
            <input
              value={form.full_name}
              onChange={(event) => updateForm("full_name", event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Phone
            <input
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Role <span className="text-red-500">*</span>
            <input
              value={form.role}
              onChange={(event) => updateForm("role", event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Joining Date
            <input
              type="date"
              value={form.joining_date}
              onChange={(event) => updateForm("joining_date", event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
            Status
            <select
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
              className={`${inputClass} mt-1.5`}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.full_name || !form.role}
            className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : mode === "add"
                ? "Add Employee"
                : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
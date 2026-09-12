"use client";

import { X } from "lucide-react";
import { Classroom, StudentFormData, inputClass, secondaryButtonClass } from "./types";

export default function StudentFormDialog({
  open,
  form,
  updateForm,
  editingId,
  saving,
  classes,
  loadingClasses,
  activeSessionId,
  onClose,
  onSave,
}: {
  open: boolean;
  form: StudentFormData;
  updateForm: <K extends keyof StudentFormData>(
    key: K,
    value: StudentFormData[K],
  ) => void;
  editingId: number | null;
  saving: boolean;
  classes: Classroom[];
  loadingClasses: boolean;
  activeSessionId: number | null;
  onClose: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-dialog-title"
    >
      <div className="mx-auto my-4 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="student-dialog-title"
            className="text-base font-bold text-slate-900 dark:text-slate-50"
          >
            {editingId ? "Edit Student" : "Add Student"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Personal Information
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                First Name <span className="text-red-500">*</span>
                <input
                  value={form.first_name}
                  onChange={(event) => updateForm("first_name", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Last Name <span className="text-red-500">*</span>
                <input
                  value={form.last_name}
                  onChange={(event) => updateForm("last_name", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <fieldset className="md:col-span-2">
                <legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Gender
                </legend>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  {["male", "female", "other"].map((gender) => (
                    <label
                      key={gender}
                      className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="radio"
                        name="gender"
                        checked={form.gender === gender}
                        onChange={() => updateForm("gender", gender)}
                        className="accent-[#8B6DF2]"
                      />
                      {gender.charAt(0).toUpperCase() + gender.slice(1)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Date of Birth
                <input
                  type="date"
                  value={form.date_of_birth || ""}
                  onChange={(event) => updateForm("date_of_birth", event.target.value)}
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
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
            </div>
          </section>
          <section>
            <h3 className="mb-3 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Parent / Guardian
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Father&apos;s Name
                <input
                  value={form.father_name}
                  onChange={(event) => updateForm("father_name", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Father&apos;s Phone
                <input
                  value={form.father_phone}
                  onChange={(event) => updateForm("father_phone", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Mother&apos;s Name
                <input
                  value={form.mother_name}
                  onChange={(event) => updateForm("mother_name", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Guardian&apos;s Name
                <input
                  value={form.guardian_name}
                  onChange={(event) => updateForm("guardian_name", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">
                Guardian&apos;s Phone
                <input
                  value={form.guardian_phone}
                  onChange={(event) => updateForm("guardian_phone", event.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
            </div>
          </section>
          {!editingId && (
            <section>
              <h3 className="mb-3 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Enrolment
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Class <span className="text-red-500">*</span>
                  <select
                    value={form.classroom_id}
                    disabled={loadingClasses}
                    onChange={(event) =>
                      updateForm("classroom_id", Number(event.target.value))
                    }
                    className={`${inputClass} mt-1.5 disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <option value={0} disabled>
                      {loadingClasses ? "Loading classes…" : "Select class"}
                    </option>
                    {classes.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.grade_name} – {classroom.section}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Discount %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.discount_percent}
                    onChange={(event) =>
                      updateForm("discount_percent", Number(event.target.value))
                    }
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Enrolment Date
                  <input
                    type="date"
                    value={form.enrollment_date}
                    onChange={(event) =>
                      updateForm("enrollment_date", event.target.value)
                    }
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
              </div>
              {!activeSessionId && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  An active academic session is required before a student can
                  be enrolled.
                </p>
              )}
            </section>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={
              saving ||
              !form.first_name ||
              !form.last_name ||
              (!editingId && (!form.classroom_id || !activeSessionId))
            }
            className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : editingId ? "Update Student" : "Add Student"}
          </button>
        </div>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useStudentDetails, useUpdateStudent } from "@/app/hooks/useStudents";
import { studentApiError } from "@/app/lib/studentApi";
import { Modal, primaryButtonClass } from "@/components/exams/ExamUi";
import { LabeledField, SectionLabel } from "@/components/finance/FinanceUi";
import { StudentError, StudentSkeleton } from "./StudentDetailStates";
import { inputClass, secondaryButtonClass, type StudentProfile, type StudentUpdate } from "./types";

type EditForm = { [K in keyof Required<StudentUpdate>]: K extends "is_active" ? boolean : string };
type TextField = Exclude<keyof EditForm, "is_active">;
function initialForm(student: StudentProfile): EditForm {
  return {
    first_name: student.first_name, last_name: student.last_name ?? "", gender: student.gender ?? "",
    date_of_birth: student.date_of_birth ?? "", phone: student.phone ?? "", email: student.email ?? "",
    father_name: student.father_name ?? "", father_phone: student.father_phone ?? "",
    mother_name: student.mother_name ?? "", guardian_name: student.guardian_name ?? "",
    guardian_phone: student.guardian_phone ?? "", is_active: student.is_active,
  };
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function EditStudentForm({ student, onClose }: { student: StudentProfile; onClose: () => void }) {
  const [baseline] = useState(() => initialForm(student));
  const [form, setForm] = useState(baseline);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [discard, setDiscard] = useState(false);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const mutation = useUpdateStudent(student.id);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function requestClose() {
    if (inFlight.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  }

  function update<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  }

  function showErrors(fields: Record<string, string>, notice: string) {
    setErrors(fields);
    setMessage(notice);
    const first = Object.keys(fields)[0];
    const input = first ? formRef.current?.elements.namedItem(first) : null;
    if (input instanceof HTMLElement) input.focus();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !dirty) return;
    const fields: Record<string, string> = {};
    if (!form.first_name.trim()) fields.first_name = "First name is required.";
    const emailInput = formRef.current?.elements.namedItem("email");
    if (form.email.trim() && (emailInput instanceof HTMLInputElement && !emailInput.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))) fields.email = "Enter a valid email address.";
    const dateInput = formRef.current?.elements.namedItem("date_of_birth");
    if (dateInput instanceof HTMLInputElement && dateInput.validity.badInput) fields.date_of_birth = "Enter a valid date of birth.";
    if (form.date_of_birth) {
      const parsed = new Date(`${form.date_of_birth}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== form.date_of_birth) fields.date_of_birth = "Enter a valid date of birth.";
      else if (form.date_of_birth > localToday()) fields.date_of_birth = "Date of birth cannot be in the future.";
    }
    if (Object.keys(fields).length) { showErrors(fields, "Please correct the highlighted fields."); return; }

    const changes: StudentUpdate = {};
    for (const key of Object.keys(form) as (keyof EditForm)[]) {
      if (form[key] === baseline[key]) continue;
      if (key === "is_active") changes.is_active = form.is_active;
      else if (key === "first_name") changes.first_name = form.first_name.trim();
      else changes[key] = form[key].trim() || null;
    }
    inFlight.current = true;
    setMessage("");
    try {
      await mutation.mutateAsync(changes);
      toast.success("Student updated successfully");
      onClose();
    } catch (error) {
      const failure = studentApiError(error, "Unable to save changes. Please try again.");
      showErrors(failure.fields, failure.message);
    } finally {
      inFlight.current = false;
    }
  }

  function field(key: TextField, label: string, type = "text", maxLength = 255) {
    return <LabeledField label={label} required={key === "first_name"}>
      <input name={key} aria-label={label} type={type} value={form[key]} required={key === "first_name"} maxLength={maxLength}
        max={type === "date" ? localToday() : undefined}
        onChange={(event) => update(key, event.target.value)} className={inputClass}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `edit-${key}-error` : undefined} />
      {errors[key] && <span id={`edit-${key}-error`} className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors[key]}</span>}
    </LabeledField>;
  }

  return <Modal title="Edit Student" onClose={requestClose} size="md" busy={mutation.isPending}>
    <form ref={formRef} onSubmit={save} noValidate aria-busy={mutation.isPending}>
      <p className="mb-5 break-words text-sm text-slate-500 dark:text-slate-400">Update the profile for {student.first_name} {student.last_name} · {student.admission_no}</p>
      {message && <div className="mb-5"><StudentError message={message} /></div>}
      <fieldset disabled={mutation.isPending} className="space-y-6 disabled:opacity-60">
        <section aria-label="Personal information">
          <SectionLabel>Personal information</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("first_name", "First name", "text", 100)}
            {field("last_name", "Last name", "text", 100)}
            <LabeledField label="Gender">
              <select name="gender" aria-label="Gender" value={form.gender} onChange={(event) => update("gender", event.target.value)} className={inputClass} aria-invalid={!!errors.gender} aria-describedby={errors.gender ? "edit-gender-error" : undefined}>
                <option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                {form.gender && !["male", "female", "other"].includes(form.gender) && <option value={form.gender}>{form.gender}</option>}
              </select>
              {errors.gender && <span id="edit-gender-error" className="mt-1 block text-xs text-red-600">{errors.gender}</span>}
            </LabeledField>
            {field("date_of_birth", "Date of birth", "date")}
            <LabeledField label="Student status">
              <select name="is_active" aria-label="Student status" value={String(form.is_active)} onChange={(event) => update("is_active", event.target.value === "true")} className={inputClass} aria-invalid={!!errors.is_active} aria-describedby={errors.is_active ? "edit-status-error" : undefined}>
                <option value="true">Active</option><option value="false">Inactive</option>
              </select>
              {errors.is_active && <span id="edit-status-error" className="mt-1 block text-xs text-red-600">{errors.is_active}</span>}
            </LabeledField>
          </div>
        </section>
        <section aria-label="Contact information">
          <SectionLabel>Contact information</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">{field("phone", "Phone", "tel", 20)}{field("email", "Email", "email")}</div>
        </section>
        <section aria-label="Parent and guardian information">
          <SectionLabel>Parent and guardian information</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("father_name", "Father’s name")}{field("father_phone", "Father’s phone", "tel", 20)}
            {field("mother_name", "Mother’s name")}{field("guardian_name", "Guardian name")}{field("guardian_phone", "Guardian phone", "tel", 20)}
          </div>
        </section>
      </fieldset>
      <div className="sticky -bottom-5 -mx-5 mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#1a2233]">
        <button type="button" onClick={requestClose} disabled={mutation.isPending} className={secondaryButtonClass}>Cancel</button>
        <button type="submit" disabled={mutation.isPending || !dirty} className={`${primaryButtonClass} inline-flex items-center justify-center gap-2`}>
          {mutation.isPending && <Loader2 size={16} className="animate-spin" />}{mutation.isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
    {discard && <Modal title="Discard unsaved changes?" onClose={() => setDiscard(false)}>
      <p className="text-sm text-slate-500 dark:text-slate-400">Your changes have not been saved. You can keep editing or discard them.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setDiscard(false)} className={secondaryButtonClass}>Keep editing</button>
        <button type="button" onClick={onClose} className={primaryButtonClass}>Discard changes</button>
      </div>
    </Modal>}
  </Modal>;
}

export default function EditStudentDialog({ studentId, onClose }: { studentId: number; onClose: () => void }) {
  const query = useStudentDetails(studentId);
  if (query.isError && !query.data) return <Modal title="Edit Student" onClose={onClose} size="md"><StudentError message={studentApiError(query.error).message} retry={() => void query.refetch()} /></Modal>;
  if (!query.data) return <Modal title="Edit Student" onClose={onClose} size="md"><StudentSkeleton /></Modal>;
  return <EditStudentForm student={query.data} onClose={onClose} />;
}

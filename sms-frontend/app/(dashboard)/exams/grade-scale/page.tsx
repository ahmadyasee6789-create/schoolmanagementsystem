"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { GraduationCap, Layers, Pencil, Percent, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import { EmptyState, LoadingState, Modal, PageHeader, StatGrid, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";
import { Badge, DataTable, LabeledField, tableCellClass, tableHeadClass } from "@/components/finance/FinanceUi";

type GradeRange = { id: number; grade: string; min_percentage: number; max_percentage: number; gpa: number | null };
type ScaleResponse = {
  items: GradeRange[]; complete: boolean;
  gaps: { minimum: number; maximum: number }[]; issues: string[];
  can_manage: boolean; history_locked: boolean; require_complete_for_finalization: boolean;
};
type Form = { grade: string; min_percentage: string; max_percentage: string; gpa: string };
const emptyForm: Form = { grade: "", min_percentage: "", max_percentage: "", gpa: "" };

function message(error: unknown, fallback: string) {
  const detail: unknown = isAxiosError(error) ? error.response?.data?.detail : undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item: { msg?: string }) => item.msg ?? "Invalid grade range").join(". ");
  }
  return fallback;
}

export default function GradeScalePage() {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["grade-scales"],
    enabled: !authLoading && Boolean(user?.org_id),
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => (await api.get<ScaleResponse>("/grade-scales", { signal })).data,
  });
  const [editing, setEditing] = useState<GradeRange | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<GradeRange | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const data = query.data;
  const isAdmin = user?.org_role === "admin";
  const canManage = isAdmin && Boolean(data?.can_manage) && !query.isFetching;

  const refreshGrades = () => client.invalidateQueries({ predicate: ({ queryKey }) =>
    queryKey[0] === "grade-scales" ||
    (queryKey[0] === "exam-entry" && queryKey[2] === "results") ||
    (queryKey[0] === "dmc" && queryKey[1] === "results") ||
    (queryKey[0] === "student" && queryKey[2] === "results"),
  });
  const openForm = (row?: GradeRange) => {
    if (!canManage) return;
    setEditing(row ?? null);
    setForm(row ? { grade: row.grade, min_percentage: String(row.min_percentage), max_percentage: String(row.max_percentage), gpa: row.gpa === null ? "" : String(row.gpa) } : emptyForm);
    setError(""); setSuccess(""); setFormOpen(true);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canManage) return;
    if (Number(form.min_percentage) > Number(form.max_percentage)) {
      setError("Minimum percentage cannot exceed maximum percentage."); return;
    }
    setBusy(true); setError("");
    try {
      const payload = { grade: form.grade.trim(), min_percentage: Number(form.min_percentage),
        max_percentage: Number(form.max_percentage), gpa: form.gpa === "" ? null : Number(form.gpa) };
      if (editing) await api.put(`/grade-scales/${editing.id}`, payload);
      else await api.post("/grade-scales", payload);
      setFormOpen(false); setSuccess(editing ? "Grade range updated." : "Grade range added.");
      await refreshGrades();
    } catch (cause) {
      setError(message(cause, "Could not save the grade range. Please try again."));
      if (isAxiosError(cause) && cause.response?.status === 409) await refreshGrades();
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting || busy || !canManage) return;
    setBusy(true); setError("");
    try {
      await api.delete(`/grade-scales/${deleting.id}`);
      setDeleting(null); setSuccess("Grade range deleted.");
      await refreshGrades();
    } catch (cause) {
      setError(message(cause, "Could not delete the grade range. Please try again."));
      if (isAxiosError(cause) && cause.response?.status === 409) await refreshGrades();
    } finally { setBusy(false); }
  };
  const close = () => { if (!busy) { setFormOpen(false); setDeleting(null); setError(""); } };

  return <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
    <PageHeader title="Grade Scale" subtitle="Manage the percentage ranges used for examination grades and DMCs"
      actionLabel={isAdmin ? "Add Grade" : undefined} onAction={() => openForm()} disabled={!canManage} />
    {!authLoading && !user?.org_id ? <div role="alert"><EmptyState icon={GraduationCap} message="School membership is required to view grade scales." /></div> : query.isPending || authLoading ? <LoadingState /> : query.isError ? <div role="alert"><EmptyState icon={GraduationCap}
      message={message(query.error, "Could not load grade scales.")} actionLabel="Retry" onAction={() => void query.refetch()} /></div> : data && <>
      <StatGrid stats={[
        { label: "Grade Ranges", value: data.items.length, Icon: Layers, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" },
        { label: "Coverage", value: data.complete ? "Complete" : "Incomplete", Icon: Percent, tone: "border-blue-400/20 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" },
        { label: "Required Coverage", value: "0–100%", Icon: GraduationCap, tone: "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
        { label: "Historical Results", value: data.history_locked ? "Protected" : "No final exams", Icon: ShieldCheck, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" },
      ]} />
      {success && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">{success}</p>}
      <div className="mb-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
        <p>Grade labels are separate from passing. Passing requires at least 40% overall and fewer than 3 failed subjects. Missing results do not count as passed.</p>
        <p>Ranges include both endpoints and support two decimal places. Complete coverage is required before publishing or locking an exam.</p>
      </div>
      {data.history_locked && <p role="status" className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
        Finalized examination history exists. Grade scales are read-only to protect historical DMC reprints, including preserved snapshots after reopening. Changing future grading rules safely requires a versioned scale.
      </p>}
      {!isAdmin && <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Only school administrators can change grade ranges.</p>}
      {!data.complete && <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
        <p className="font-semibold">Coverage needs attention</p>
        {data.gaps.length > 0 && <p className="mt-1">Uncovered percentages: {data.gaps.map((gap) => `${gap.minimum}%–${gap.maximum}%`).join(", ")}.</p>}
        {data.issues.map((issue) => <p key={issue} className="mt-1">{issue}</p>)}
        <p className="mt-1">You can build the scale in stages. Fill all gaps and resolve conflicts before finalizing an exam.</p>
      </div>}
      {data.items.length === 0 ? <EmptyState icon={GraduationCap} message="No grade ranges have been configured"
        actionLabel={canManage ? "Add your first grade" : undefined} onAction={() => openForm()} /> : <DataTable label="Grade percentage ranges" showOnMobile>
        <thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>
          {["Grade", "Minimum (%)", "Maximum (%)", "GPA", ...(isAdmin ? ["Actions"] : [])].map((label) => <th key={label} scope="col" className={tableHeadClass}>{label}</th>)}
        </tr></thead><tbody>{data.items.map((row) => <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]">
          <td className={tableCellClass}><Badge>{row.grade}</Badge></td><td className={tableCellClass}>{row.min_percentage}%</td>
          <td className={tableCellClass}>{row.max_percentage}%</td><td className={tableCellClass}>{row.gpa ?? "—"}</td>
          {isAdmin && <td className={tableCellClass}><div className="flex items-center gap-2">
            <button type="button" disabled={!canManage} onClick={() => openForm(row)} aria-label={`Edit grade ${row.grade}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/5"><Pencil size={16} /></button>
            <button type="button" disabled={!canManage} onClick={() => { setDeleting(row); setError(""); setSuccess(""); }} aria-label={`Delete grade ${row.grade}`} className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10"><Trash2 size={16} /></button>
          </div></td>}
        </tr>)}</tbody>
      </DataTable>}
    </>}
    {formOpen && <Modal title={editing ? "Edit Grade" : "Add Grade"} onClose={close} busy={busy}>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <LabeledField label="Grade label" required><input aria-label="Grade label" autoFocus required maxLength={50} value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })} className={inputClass} /></LabeledField>
        <LabeledField label="Minimum percentage" required><input aria-label="Minimum percentage" type="number" required min={0} max={100} step="0.01" value={form.min_percentage} onChange={(event) => setForm({ ...form, min_percentage: event.target.value })} className={inputClass} /></LabeledField>
        <LabeledField label="Maximum percentage" required><input aria-label="Maximum percentage" type="number" required min={0} max={100} step="0.01" value={form.max_percentage} onChange={(event) => setForm({ ...form, max_percentage: event.target.value })} className={inputClass} /></LabeledField>
        <LabeledField label="GPA (optional)"><input aria-label="GPA (optional)" type="number" min={0} step="any" value={form.gpa} onChange={(event) => setForm({ ...form, gpa: event.target.value })} className={inputClass} /></LabeledField>
        <p className="text-xs text-slate-500 dark:text-slate-400">Changes affect grades calculated for editable examinations. Marks and the passing rule stay the same.</p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10"><button type="button" disabled={busy} onClick={close} className={secondaryButtonClass}>Cancel</button><button type="submit" disabled={busy || !canManage} className={primaryButtonClass}>{busy ? "Saving…" : "Save Grade"}</button></div>
      </form>
    </Modal>}
    {deleting && <Modal title="Delete Grade?" onClose={close} busy={busy}>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      <p className="text-sm text-slate-600 dark:text-slate-300">Delete grade “{deleting.grade}” ({deleting.min_percentage}%–{deleting.max_percentage}%)? This may leave a gap that must be filled before an exam can be finalized.</p>
      <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={close} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={busy || !canManage} onClick={() => void remove()} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Deleting…" : "Delete Grade"}</button></div>
    </Modal>}
  </div>;
}

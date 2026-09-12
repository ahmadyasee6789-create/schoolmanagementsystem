"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Pencil, ReceiptText, School } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { EmptyState, LoadingState, Modal, PageHeader, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";
import { Badge, DataTable, errorMessage, LabeledField, Money, SectionLabel, tableCellClass, tableHeadClass } from "@/components/finance/FinanceUi";

type FeeStructure = { id: number; class_id: number; class_name: string; monthly_fee: number; admission_fee: number; exam_fee: number; session_id: number };
type Classroom = { id: number; section: string; grade_id?: number; grade_name?: string; grade?: { name: string } };
type AcademicSession = { id: number; name: string };
type FeeForm = { id: number; class_id: string; session_id: string; monthly_fee: string; admission_fee: string; exam_fee: string };

const emptyForm: FeeForm = { id: 0, class_id: "", session_id: "", monthly_fee: "", admission_fee: "", exam_fee: "" };
const classLabel = (classroom: Classroom) => {
  const grade = classroom.grade?.name ?? classroom.grade_name ?? "";
  return grade ? `${grade} – ${classroom.section}` : classroom.section;
};

function FeeBreakdown({ structure }: { structure: FeeStructure }) {
  return <div className="grid grid-cols-3 gap-2"><div><p className="text-[11px] text-slate-400 dark:text-slate-500">Monthly</p><Money value={structure.monthly_fee} className="mt-1 block text-[#8B6DF2]" /></div><div><p className="text-[11px] text-slate-400 dark:text-slate-500">Admission</p><Money value={structure.admission_fee} className="mt-1 block text-emerald-600 dark:text-emerald-400" /></div><div><p className="text-[11px] text-slate-400 dark:text-slate-500">Exam</p><Money value={structure.exam_fee} className="mt-1 block text-blue-600 dark:text-blue-400" /></div></div>;
}

export default function FeeStructurePage() {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState<FeeForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchStructures = async () => {
    setLoading(true);
    try {
      const response = await api.get("/fee-structure");
      setStructures(response.data ?? []);
    } catch { toast.error("Failed to load fee structures"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void Promise.all([api.get("/classes"), api.get("/sessions")]).then(([classesResponse, sessionsResponse]) => {
      setClasses(classesResponse.data ?? []);
      setSessions(sessionsResponse.data ?? []);
    }).catch(() => toast.error("Failed to load class and session options"));
    void fetchStructures();
  }, []);

  const openAdd = () => { setForm(emptyForm); setOpenDialog(true); };
  const openEdit = (structure: FeeStructure) => {
    setForm({ id: structure.id, class_id: String(structure.class_id), session_id: String(structure.session_id), monthly_fee: String(structure.monthly_fee), admission_fee: String(structure.admission_fee), exam_fee: String(structure.exam_fee) });
    setOpenDialog(true);
  };
  const saveStructure = async () => {
    if (!form.class_id || !form.session_id || !form.monthly_fee) return toast.error("Select class and session, then enter the monthly fee");
    setSaving(true);
    const payload = { class_id: Number(form.class_id), session_id: Number(form.session_id), monthly_fee: Number(form.monthly_fee), admission_fee: Number(form.admission_fee || 0), exam_fee: Number(form.exam_fee || 0) };
    try {
      if (form.id) { await api.put(`/fee-structure/${form.id}`, payload); toast.success("Fee structure updated"); }
      else { await api.post("/fee-structure", payload); toast.success("Fee structure created"); }
      setOpenDialog(false);
      await fetchStructures();
    } catch (error: unknown) { toast.error(errorMessage(error, "Error saving fee structure")); }
    finally { setSaving(false); }
  };

  return <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
    <PageHeader title="Fee Structure" subtitle="Manage class-wise fee structures per academic session" actionLabel="Add Fee Structure" onAction={openAdd} />
    {loading ? <LoadingState /> : structures.length === 0 ? <EmptyState icon={ReceiptText} message="No fee structures found" actionLabel="Add Fee Structure" onAction={openAdd} /> : <>
      <div className="grid gap-3 sm:hidden">{structures.map((structure) => <article key={structure.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><BookOpenCheck size={18} className="text-[#8B6DF2]" /></span><div><p className="text-sm font-bold text-slate-900 dark:text-slate-50">{structure.class_name}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Fee structure</p></div></div><button type="button" title="Edit fee structure" onClick={() => openEdit(structure)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Pencil size={16} /></button></div><FeeBreakdown structure={structure} /></article>)}</div>
      <DataTable><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Class", "Monthly Fee", "Admission Fee", "Exam Fee", "Actions"].map((heading) => <th key={heading} className={tableHeadClass}>{heading}</th>)}</tr></thead><tbody>{structures.map((structure) => <tr key={structure.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className={`${tableCellClass} font-semibold text-slate-900 dark:text-slate-100`}><span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><BookOpenCheck size={15} className="text-[#8B6DF2]" /></span>{structure.class_name}</span></td><td className={tableCellClass}><Badge tone="purple"><Money value={structure.monthly_fee} className="text-[#8B6DF2]" /></Badge></td><td className={tableCellClass}><Badge tone="green"><Money value={structure.admission_fee} className="text-emerald-600 dark:text-emerald-400" /></Badge></td><td className={tableCellClass}><Badge tone="blue"><Money value={structure.exam_fee} className="text-blue-600 dark:text-blue-400" /></Badge></td><td className={tableCellClass}><button type="button" title="Edit fee structure" onClick={() => openEdit(structure)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Pencil size={16} /></button></td></tr>)}</tbody></DataTable>
    </>}

    {openDialog && <Modal title={form.id ? "Edit Fee Structure" : "Add Fee Structure"} onClose={() => !saving && setOpenDialog(false)}><div className="space-y-5"><section><SectionLabel icon={School}>Class & Session</SectionLabel><div className="space-y-4"><LabeledField label="Class" required><select value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })} className={inputClass}><option value="" disabled>Select class</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classLabel(classroom)}</option>)}</select></LabeledField><LabeledField label="Academic Session" required><select value={form.session_id} onChange={(event) => setForm({ ...form, session_id: event.target.value })} className={inputClass}><option value="" disabled>Select session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</select></LabeledField></div></section><section><SectionLabel icon={ReceiptText}>Fee Amounts</SectionLabel><div className="grid gap-4 sm:grid-cols-2"><LabeledField label="Monthly Fee" required><input type="number" min={0} placeholder="0" value={form.monthly_fee} onChange={(event) => setForm({ ...form, monthly_fee: event.target.value })} className={inputClass} /></LabeledField><LabeledField label="Admission Fee"><input type="number" min={0} placeholder="0" value={form.admission_fee} onChange={(event) => setForm({ ...form, admission_fee: event.target.value })} className={inputClass} /></LabeledField><LabeledField label="Exam Fee"><input type="number" min={0} placeholder="0" value={form.exam_fee} onChange={(event) => setForm({ ...form, exam_fee: event.target.value })} className={inputClass} /></LabeledField></div></section><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5"><button type="button" disabled={saving} onClick={() => setOpenDialog(false)} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={saving || !form.class_id || !form.session_id || !form.monthly_fee} onClick={() => void saveStructure()} className={primaryButtonClass}>{saving ? "Saving…" : form.id ? "Save Changes" : "Add Structure"}</button></div></div></Modal>}
  </div>;
}

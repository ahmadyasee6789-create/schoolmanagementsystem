"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus, Search, Trash2, Upload, UserRound, Users, X } from "lucide-react";
import { api } from "@/app/lib/api";
import { usePaginatedQuery } from "@/app/hooks/usePaginatedQuery";
import { useAuthStore } from "@/app/store/authStore";
import toast from "react-hot-toast";

type Grade = { id: number; name: string };
type Classroom = { id: number; grade_id: number; section: string; grade_name: string };
type Student = {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  gender: string;
  date_of_birth: string;
  is_active: boolean;
  grade_name?: string;
  section?: string;
  roll_number?: number;
  discount_percent?: number;
};
type StudentFormData = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  father_name: string;
  father_phone: string;
  mother_name: string;
  guardian_name: string;
  guardian_phone: string;
  gender: string;
  date_of_birth: string;
  classroom_id: number;
  discount_percent: number;
  enrollment_date: string;
};
type ApiError = { response?: { data?: { detail?: string } } };

const emptyForm: StudentFormData = {
  id: 0, first_name: "", last_name: "", phone: "", email: "", father_name: "", father_phone: "", mother_name: "", guardian_name: "", guardian_phone: "", gender: "male", date_of_birth: "", classroom_id: 0, discount_percent: 0, enrollment_date: new Date().toISOString().split("T")[0],
};
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500";
const secondaryButtonClass = "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";

function StudentCard({ student, onEdit, onDelete }: { student: Student; onEdit: () => void; onDelete: () => void }) {
  const parent = student.father_name || student.mother_name || student.guardian_name || "No parent recorded";
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#8B6DF2]/40 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><UserRound size={15} className="text-[#8B6DF2]" /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{student.first_name} {student.last_name}</p><p className="mt-0.5 text-xs font-medium text-[#8B6DF2]">{student.admission_no}</p></div></div></div>
        <div className="flex shrink-0 gap-1"><button type="button" title="Edit student" onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Pencil size={16} /></button><button type="button" title="Delete student" onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-500"><Trash2 size={16} /></button></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-slate-400 dark:text-slate-500">Class</p><p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{student.grade_name ? `${student.grade_name} – ${student.section}` : "Not enrolled"}</p></div><div><p className="text-slate-400 dark:text-slate-500">Roll no.</p><p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{student.roll_number || "—"}</p></div><div className="col-span-2"><p className="text-slate-400 dark:text-slate-500">Parent / guardian</p><p className="mt-1 truncate font-semibold text-slate-700 dark:text-slate-200">{parent}</p></div></div>
    </article>
  );
}

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StudentFormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const { user, hydrated } = useAuthStore();
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<unknown>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!hydrated || !user) return;
    Promise.all([api.get("/classes"), api.get("/grades"), api.get("/sessions/active")])
      .then(([classrooms, gradeList, session]) => {
        setClasses(classrooms.data);
        setGrades(gradeList.data);
        setActiveSessionId(session.data?.id ?? null);
      })
      .catch((error) => console.error("Failed to fetch student form data:", error))
      .finally(() => setLoadingClasses(false));
  }, [user, hydrated]);

  const { data: students = [], loading, refetch, page, totalPages, setPage } = usePaginatedQuery({
    fetcher: async ({ page: currentPage, limit, search: query, grade_name }) => {
      const response = await api.get("/students", { params: { page: currentPage, limit, search: query, grade_name } });
      const data = Array.isArray(response.data) ? response.data : (response.data.items ?? []);
      const pageCount = Array.isArray(response.data) ? 1 : (response.data.total_pages ?? 1);
      return { data, totalPages: pageCount };
    },
    filters: { search, grade_name: gradeFilter !== "all" ? gradeFilter : undefined },
    debounceKeys: ["search"],
  });

  const updateForm = <K extends keyof StudentFormData>(key: K, value: StudentFormData[K]) => setForm((previous) => ({ ...previous, [key]: value }));
  const openAddDialog = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEditDialog = (student: Student) => {
    setForm({ id: student.id, first_name: student.first_name, last_name: student.last_name, phone: student.phone || "", email: student.email || "", father_name: student.father_name || "", father_phone: student.father_phone || "", mother_name: student.mother_name || "", guardian_name: student.guardian_name || "", guardian_phone: student.guardian_phone || "", gender: student.gender, date_of_birth: student.date_of_birth, classroom_id: 0, discount_percent: student.discount_percent || 0, enrollment_date: new Date().toISOString().split("T")[0] });
    setEditingId(student.id);
    setDialogOpen(true);
  };
  const saveStudent = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, { first_name: form.first_name, last_name: form.last_name, phone: form.phone || null, email: form.email || null, father_name: form.father_name || null, father_phone: form.father_phone || null, mother_name: form.mother_name || null, guardian_name: form.guardian_name || null, guardian_phone: form.guardian_phone || null, gender: form.gender, date_of_birth: form.date_of_birth || null });
      } else {
        await api.post("/students/with-enrollment", { ...form, phone: form.phone || null, email: form.email || null, father_name: form.father_name || null, father_phone: form.father_phone || null, mother_name: form.mother_name || null, guardian_name: form.guardian_name || null, guardian_phone: form.guardian_phone || null, date_of_birth: form.date_of_birth || null, classroom_id: Number(form.classroom_id), session_id: activeSessionId, discount_percent: Number(form.discount_percent) || 0 });
      }
      toast.success(editingId ? "Student updated" : "Student added");
      setDialogOpen(false);
      refetch();
    } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail || "Something went wrong"); } finally { setSaving(false); }
  };
  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await api.delete(`/students/${deleteId}`); toast.success("Student deleted"); setDeleteId(null); refetch(); }
    catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail || "Failed to delete student"); } finally { setDeleting(false); }
  };
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setImporting(true);
    try {
      const response = await api.post("/students/import/preview", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setImportPreview(response.data);
      toast.success("Import preview loaded");
    } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail || "Import failed"); } finally { setImporting(false); event.target.value = ""; }
  };

  const pageItems = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1)
    .reduce<(number | "…")[]>((items, item, index, filteredItems) => { if (index > 0 && item - filteredItems[index - 1] > 1) items.push("…"); items.push(item); return items; }, []);

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">Students</h1><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Manage student records, enrolments and information</p></div><div className="flex flex-wrap items-center gap-2"><label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"><Upload size={16} />{importing ? "Importing…" : "Import Students"}<input hidden type="file" accept=".xlsx,.csv" onChange={handleImport} /></label><button type="button" onClick={openAddDialog} className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"><Plus size={16} />Add Student</button></div></div>

      {Boolean(importPreview) && <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400"><Upload size={16} /><span>Import preview is ready. Review the uploaded data before continuing.</span><button type="button" onClick={() => setImportPreview(null)} className="ml-auto rounded-md p-1 hover:bg-emerald-500/10" aria-label="Dismiss import preview"><X size={15} /></button></div>}

      <div className="mb-6 grid gap-3 md:grid-cols-12"><div className="relative md:col-span-7"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name or admission no…" className={`${inputClass} pl-9`} /></div><select value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setPage(1); }} className={`${inputClass} md:col-span-5`}><option value="all">All Grades</option>{grades.map((grade) => <option key={grade.id} value={grade.name}>{grade.name}</option>)}</select></div>

      {loading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div> : (students as Student[]).length === 0 ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10"><Users size={32} className="mb-3 text-slate-300 dark:text-slate-600" /><p className="mb-4 text-sm text-slate-500 dark:text-slate-400">No students found</p><button type="button" onClick={openAddDialog} className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Add your first student</button></div> : <>
        <div className="grid gap-3 sm:hidden">{(students as Student[]).map((student) => <StudentCard key={student.id} student={student} onEdit={() => openEditDialog(student)} onDelete={() => setDeleteId(student.id)} />)}</div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 sm:block"><table className="w-full min-w-[1100px] border-collapse text-left"><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Adm. No.", "Name", "Grade / Section", "Parent", "Contact", "Roll No.", "Discount", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{heading}</th>)}</tr></thead><tbody>{(students as Student[]).map((student) => <tr key={student.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className="px-4 py-3 text-sm font-semibold text-[#8B6DF2]">{student.admission_no}</td><td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{student.first_name} {student.last_name}</td><td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{student.grade_name ? <span className="rounded-md border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 px-2 py-1 text-xs font-semibold text-[#8B6DF2]">{student.grade_name} – {student.section}</span> : <span className="text-slate-400 dark:text-slate-500">Not enrolled</span>}</td><td className="max-w-48 truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{student.father_name || student.mother_name || student.guardian_name || "—"}</td><td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{student.father_phone || student.guardian_phone || "—"}</td><td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{student.roll_number || "—"}</td><td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{student.discount_percent ? `${student.discount_percent}%` : "—"}</td><td className="px-4 py-3"><div className="flex gap-1"><button type="button" title="Edit student" onClick={() => openEditDialog(student)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Pencil size={16} /></button><button type="button" title="Delete student" onClick={() => setDeleteId(student.id)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-500"><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>
      </>}

      {totalPages > 1 && <nav aria-label="Student pages" className="mt-6 flex flex-wrap justify-center gap-1"><button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className={secondaryButtonClass}>← Previous</button>{pageItems.map((item, index) => item === "…" ? <span key={`ellipsis-${index}`} className="px-2 py-2 text-sm text-slate-400 dark:text-slate-500">…</span> : <button key={item} type="button" onClick={() => setPage(item)} className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold transition-colors ${page === item ? "border-[#8B6DF2] bg-[#8B6DF2]/10 text-[#8B6DF2]" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"}`}>{item}</button>)}<button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className={secondaryButtonClass}>Next →</button></nav>}

      {dialogOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="student-dialog-title"><div className="mx-auto my-4 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]"><div className="mb-5 flex items-center justify-between"><h2 id="student-dialog-title" className="text-base font-bold text-slate-900 dark:text-slate-50">{editingId ? "Edit Student" : "Add Student"}</h2><button type="button" onClick={() => setDialogOpen(false)} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"><X size={18} /></button></div>
        <div className="space-y-6"><section><h3 className="mb-3 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Personal Information</h3><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">First Name <span className="text-red-500">*</span><input value={form.first_name} onChange={(event) => updateForm("first_name", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Last Name <span className="text-red-500">*</span><input value={form.last_name} onChange={(event) => updateForm("last_name", event.target.value)} className={`${inputClass} mt-1.5`} /></label><fieldset className="md:col-span-2"><legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">Gender</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{["male", "female", "other"].map((gender) => <label key={gender} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><input type="radio" name="gender" checked={form.gender === gender} onChange={() => updateForm("gender", gender)} className="accent-[#8B6DF2]" />{gender.charAt(0).toUpperCase() + gender.slice(1)}</label>)}</div></fieldset><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Date of Birth<input type="date" value={form.date_of_birth || ""} onChange={(event) => updateForm("date_of_birth", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Phone<input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">Email<input type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} className={`${inputClass} mt-1.5`} /></label></div></section>
          <section><h3 className="mb-3 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Parent / Guardian</h3><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Father&apos;s Name<input value={form.father_name} onChange={(event) => updateForm("father_name", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Father&apos;s Phone<input value={form.father_phone} onChange={(event) => updateForm("father_phone", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Mother&apos;s Name<input value={form.mother_name} onChange={(event) => updateForm("mother_name", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Guardian&apos;s Name<input value={form.guardian_name} onChange={(event) => updateForm("guardian_name", event.target.value)} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">Guardian&apos;s Phone<input value={form.guardian_phone} onChange={(event) => updateForm("guardian_phone", event.target.value)} className={`${inputClass} mt-1.5`} /></label></div></section>
          {!editingId && <section><h3 className="mb-3 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Enrolment</h3><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Class <span className="text-red-500">*</span><select value={form.classroom_id} disabled={loadingClasses} onChange={(event) => updateForm("classroom_id", Number(event.target.value))} className={`${inputClass} mt-1.5 disabled:cursor-not-allowed disabled:opacity-50`}><option value={0} disabled>{loadingClasses ? "Loading classes…" : "Select class"}</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.grade_name} – {classroom.section}</option>)}</select></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Discount %<input type="number" min={0} max={100} value={form.discount_percent} onChange={(event) => updateForm("discount_percent", Number(event.target.value))} className={`${inputClass} mt-1.5`} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Enrolment Date<input type="date" value={form.enrollment_date} onChange={(event) => updateForm("enrollment_date", event.target.value)} className={`${inputClass} mt-1.5`} /></label></div>{!activeSessionId && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">An active academic session is required before a student can be enrolled.</p>}</section>}</div>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDialogOpen(false)} disabled={saving} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={saveStudent} disabled={saving || !form.first_name || !form.last_name || (!editingId && (!form.classroom_id || !activeSessionId))} className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving…" : editingId ? "Update Student" : "Add Student"}</button></div>
      </div></div>}

      {deleteId !== null && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-student-title"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10"><AlertTriangle size={18} className="text-red-500" /></span><h2 id="delete-student-title" className="text-base font-bold text-slate-900 dark:text-slate-50">Delete student?</h2></div><p className="mt-3 text-sm text-slate-500 dark:text-slate-400">This will permanently delete the student record.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteId(null)} disabled={deleting} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40">{deleting ? "Deleting…" : "Delete"}</button></div></div></div>}
    </div>
  );
}

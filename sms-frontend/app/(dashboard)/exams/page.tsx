"use client";

import { useEffect, useState } from "react";
import { ClipboardList, FileClock, Lock, Search, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import DeleteModal from "@/components/exams/DeleteModal";
import ExamFormModal from "@/components/exams/ExamFormModal";
import ExamsList from "@/components/exams/ExamsList";
import { EmptyState, LoadingState, PageHeader, StatGrid, inputClass } from "@/components/exams/ExamUi";
import type { AcademicSession, ApiError, Exam, ExamForm, Term } from "@/components/exams/types";
import { emptyExamForm } from "@/components/exams/types";

type StatusFilter = "all" | "draft" | "published" | "locked";

export default function ExamsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [exams, setExams] = useState<Exam[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [activeSession, setActiveSession] = useState<AcademicSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [termFilter, setTermFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExamForm>(emptyExamForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reloadExams = async () => {
    try {
      const response = await api.get("/exams");
      setExams(Array.isArray(response.data) ? response.data : []);
    } catch {
      toast.error("Failed to load exams");
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/signin"); return; }
    const loadPage = async () => {
      try {
        const [sessionResponse, termsResponse, examsResponse] = await Promise.all([
          api.get("/sessions/active").catch(() => ({ data: null })),
          api.get("/terms"),
          api.get("/exams"),
        ]);
        setActiveSession(sessionResponse.data);
        setTerms(Array.isArray(termsResponse.data) ? termsResponse.data : []);
        setExams(Array.isArray(examsResponse.data) ? examsResponse.data : []);
      } catch {
        toast.error("Failed to load exam data");
      } finally {
        setLoading(false);
      }
    };
    void loadPage();
  }, [authLoading, router, user]);

  const filteredExams = exams.filter((exam) => {
    const matchesSearch = exam.name.toLowerCase().includes(search.toLowerCase());
    const matchesTerm = termFilter === "all" || exam.term_id === termFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "draft" && !exam.is_published && !exam.is_locked) || (statusFilter === "published" && exam.is_published && !exam.is_locked) || (statusFilter === "locked" && exam.is_locked);
    return matchesSearch && matchesTerm && matchesStatus;
  });
  const stats = { total: exams.length, draft: exams.filter((exam) => !exam.is_published && !exam.is_locked).length, published: exams.filter((exam) => exam.is_published && !exam.is_locked).length, locked: exams.filter((exam) => exam.is_locked).length };
  const noTerms = terms.length === 0;
  const selectedExam = exams.find((exam) => exam.id === deleteId);

  const openAdd = () => { setForm({ ...emptyExamForm, term_id: terms[0]?.id ?? 0 }); setEditingId(null); setDialogOpen(true); };
  const openEdit = (exam: Exam) => { setForm({ name: exam.name, start_date: exam.start_date, end_date: exam.end_date, weightage: exam.weightage, term_id: exam.term_id }); setEditingId(exam.id); setDialogOpen(true); };
  const saveExam = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date || !form.term_id) return;
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), weightage: Number(form.weightage) };
      if (editingId) { await api.put(`/exams/${editingId}`, payload); toast.success("Exam updated"); }
      else { await api.post("/exams", payload); toast.success("Exam scheduled"); }
      setDialogOpen(false);
      await reloadExams();
    } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Failed to save exam"); } finally { setSaving(false); }
  };
  const publishExam = async (exam: Exam) => { try { await api.put(`/exams/${exam.id}/publish`); toast.success("Exam published"); await reloadExams(); } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Failed to publish exam"); } };
  const lockExam = async (exam: Exam) => { try { await api.put(`/exams/${exam.id}/lock`); toast.success("Exam locked"); await reloadExams(); } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Failed to lock exam"); } };
  const confirmDelete = async () => { if (!deleteId) return; setDeleting(true); try { await api.delete(`/exams/${deleteId}`); toast.success("Exam deleted"); setDeleteId(null); await reloadExams(); } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Cannot delete exam"); } finally { setDeleting(false); } };

  return <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
    <PageHeader title="Examinations" subtitle="Schedule and manage exams · publish to make visible · lock after results entry" badge={activeSession?.name} actionLabel="Schedule Exam" onAction={openAdd} disabled={noTerms} />
    {!loading && noTerms && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10"><div><p className="text-sm font-semibold text-amber-700 dark:text-amber-400">No terms available</p><p className="text-xs text-amber-700/80 dark:text-amber-400/70">Exams must belong to a term. Create at least one term first.</p></div><button type="button" onClick={() => router.push("/academics/terms")} className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/10">Go to Terms</button></div>}
    <StatGrid stats={[{ label: "Total Exams", value: stats.total, Icon: ClipboardList, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" }, { label: "Draft", value: stats.draft, Icon: FileClock, tone: "border-blue-400/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400" }, { label: "Published", value: stats.published, Icon: Send, tone: "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" }, { label: "Locked", value: stats.locked, Icon: Lock, tone: "border-red-400/20 bg-red-50 text-red-500 dark:border-red-400/20 dark:bg-red-500/10" }]} />
    <div className="mb-6 grid gap-3 lg:grid-cols-12"><div className="relative lg:col-span-6"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exams…" className={`${inputClass} pl-9`} /></div><select value={termFilter} onChange={(event) => setTermFilter(event.target.value === "all" ? "all" : Number(event.target.value))} className={`${inputClass} lg:col-span-3`}><option value="all">All Terms</option>{terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className={`${inputClass} lg:col-span-3`}><option value="all">All Status</option><option value="draft">Draft</option><option value="published">Published</option><option value="locked">Locked</option></select></div>
    {loading || authLoading ? <LoadingState /> : filteredExams.length === 0 ? <EmptyState icon={ClipboardList} message={search ? "No exams match your search" : "No exams yet — schedule your first exam"} actionLabel={noTerms ? undefined : "Schedule Exam"} onAction={openAdd} /> : <ExamsList exams={filteredExams} onEdit={openEdit} onPublish={publishExam} onLock={lockExam} onDelete={(exam) => setDeleteId(exam.id)} />}
    {dialogOpen && <ExamFormModal form={form} terms={terms} editing={Boolean(editingId)} saving={saving} onChange={setForm} onClose={() => setDialogOpen(false)} onSave={saveExam} />}
    {deleteId !== null && <DeleteModal title="Delete Exam?" description={`Only draft exams can be deleted.${selectedExam?.name ? ` “${selectedExam.name}” will be removed.` : ""}`} loading={deleting} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} />}
  </div>;
}

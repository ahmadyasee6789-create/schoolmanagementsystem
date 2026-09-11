"use client";

import { useEffect, useState } from "react";
import { BookOpen, FileText, GraduationCap, Search, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import DeleteModal from "@/components/exams/DeleteModal";
import PaperFormModal from "@/components/exams/PaperFormModal";
import PapersList from "@/components/exams/PapersList";
import { EmptyState, LoadingState, PageHeader, StatGrid, inputClass } from "@/components/exams/ExamUi";
import type { ApiError, Classroom, Exam, ExamPaper, PaperForm, Subject } from "@/components/exams/types";
import { emptyPaperForm } from "@/components/exams/types";

export default function ExamPapersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState<number | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PaperForm>(emptyPaperForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reloadPapers = async () => {
    try { const response = await api.get("/exam-papers"); setPapers(Array.isArray(response.data) ? response.data : []); }
    catch { toast.error("Failed to load exam papers"); }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/signin"); return; }
    const loadPage = async () => {
      try {
        const [papersResponse, examsResponse, classroomsResponse, subjectsResponse] = await Promise.all([api.get("/exam-papers"), api.get("/exams"), api.get("/classes"), api.get("/subjects")]);
        setPapers(Array.isArray(papersResponse.data) ? papersResponse.data : []);
        setExams(Array.isArray(examsResponse.data) ? examsResponse.data : []);
        setClassrooms(Array.isArray(classroomsResponse.data) ? classroomsResponse.data : []);
        setSubjects(Array.isArray(subjectsResponse.data) ? subjectsResponse.data : []);
      } catch { toast.error("Failed to load exam paper data"); }
      finally { setLoading(false); }
    };
    void loadPage();
  }, [authLoading, router, user]);

  const filteredPapers = papers.filter((paper) => (paper.exam_name.toLowerCase().includes(search.toLowerCase()) || paper.subject_name.toLowerCase().includes(search.toLowerCase()) || paper.classroom_name.toLowerCase().includes(search.toLowerCase())) && (examFilter === "all" || paper.exam_id === examFilter));
  const grouped = filteredPapers.reduce<Record<string, { examName: string; papers: ExamPaper[] }>>((groups, paper) => { const key = String(paper.exam_id); if (!groups[key]) groups[key] = { examName: paper.exam_name, papers: [] }; groups[key].papers.push(paper); return groups; }, {});
  const stats = { total: papers.length, exams: new Set(papers.map((paper) => paper.exam_id)).size, subjects: new Set(papers.map((paper) => paper.subject_id)).size, passRate: papers.length ? Math.round((papers.reduce((total, paper) => total + paper.pass_marks / Math.max(paper.total_marks, 1), 0) / papers.length) * 100) : 0 };
  const noExams = exams.length === 0;
  const selectedPaper = papers.find((paper) => paper.id === deleteId);

  const openAdd = () => { setForm({ ...emptyPaperForm, exam_id: exams[0]?.id ?? 0 }); setEditingId(null); setDialogOpen(true); };
  const openEdit = (paper: ExamPaper) => { setForm({ exam_id: paper.exam_id, classroom_id: paper.classroom_id, subject_id: paper.subject_id, total_marks: paper.total_marks, pass_marks: paper.pass_marks }); setEditingId(paper.id); setDialogOpen(true); };
  const savePaper = async () => {
    if (!form.exam_id || !form.classroom_id || !form.subject_id || form.pass_marks > form.total_marks) return;
    setSaving(true);
    try {
      if (editingId) { await api.put(`/exam-papers/${editingId}`, { total_marks: Number(form.total_marks), pass_marks: Number(form.pass_marks) }); toast.success("Exam paper updated"); }
      else { await api.post("/exam-papers", form); toast.success("Exam paper created"); }
      setDialogOpen(false);
      await reloadPapers();
    } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Failed to save exam paper"); }
    finally { setSaving(false); }
  };
  const confirmDelete = async () => { if (!deleteId) return; setDeleting(true); try { await api.delete(`/exam-papers/${deleteId}`); toast.success("Exam paper deleted"); setDeleteId(null); await reloadPapers(); } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Cannot delete exam paper"); } finally { setDeleting(false); } };

  return <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
    <PageHeader title="Exam Papers" subtitle="Assign subjects and mark schemes to exams per classroom" actionLabel="Add Exam Paper" onAction={openAdd} disabled={noExams} />
    {!loading && noExams && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10"><div><p className="text-sm font-semibold text-amber-700 dark:text-amber-400">No exams available</p><p className="text-xs text-amber-700/80 dark:text-amber-400/70">Exam papers must be linked to an exam. Create an exam first.</p></div><button type="button" onClick={() => router.push("/exams")} className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/10">Go to Exams</button></div>}
    <StatGrid stats={[{ label: "Total Papers", value: stats.total, Icon: FileText, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" }, { label: "Exams Covered", value: stats.exams, Icon: Trophy, tone: "border-blue-400/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400" }, { label: "Subjects", value: stats.subjects, Icon: BookOpen, tone: "border-violet-400/20 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-400" }, { label: "Avg Pass Rate", value: `${stats.passRate}%`, Icon: GraduationCap, tone: "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" }]} />
    <div className="mb-6 grid gap-3 md:grid-cols-12"><div className="relative md:col-span-8"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by exam, subject or class…" className={`${inputClass} pl-9`} /></div><select value={examFilter} onChange={(event) => setExamFilter(event.target.value === "all" ? "all" : Number(event.target.value))} className={`${inputClass} md:col-span-4`}><option value="all">All Exams</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}</select></div>
    {loading || authLoading ? <LoadingState /> : filteredPapers.length === 0 ? <EmptyState icon={FileText} message={search ? "No papers match your search" : "No exam papers yet — add your first one"} actionLabel={noExams ? undefined : "Add Exam Paper"} onAction={openAdd} /> : <PapersList grouped={grouped} onEdit={openEdit} onDelete={(paper) => setDeleteId(paper.id)} />}
    {dialogOpen && <PaperFormModal form={form} exams={exams} classrooms={classrooms} subjects={subjects} editing={Boolean(editingId)} saving={saving} onChange={setForm} onClose={() => setDialogOpen(false)} onSave={savePaper} />}
    {deleteId !== null && <DeleteModal title="Delete Exam Paper?" description={`This will permanently delete${selectedPaper ? ` the ${selectedPaper.subject_name} paper` : " the paper"}. Deletion is blocked if student results are already linked to it.`} loading={deleting} onClose={() => setDeleteId(null)} onConfirm={confirmDelete} />}
  </div>;
}

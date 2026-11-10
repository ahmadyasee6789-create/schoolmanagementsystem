"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  FileText,
  GraduationCap,
  Search,
  Trophy,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import DeleteModal from "@/components/exams/DeleteModal";
import PaperFormModal from "@/components/exams/PaperFormModal";
import BulkPaperFormModal from "@/components/exams/BulkPaperFormModal";
import PapersList from "@/components/exams/PapersList";
import {
  EmptyState,
  LoadingState,
  PageHeader,
  StatGrid,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/exams/ExamUi";
import type {
  ApiError,
  Classroom,
  Exam,
  ExamPaper,
  PaperForm,
  Subject,
} from "@/components/exams/types";
import { emptyPaperForm } from "@/components/exams/types";

type ExamPapersData = {
  papers: ExamPaper[];
  exams: Exam[];
  classrooms: Classroom[];
  subjects: Subject[];
};

type ExamPaperDeletionPreview = {
  paper_id: number;
  exam_name: string;
  classroom_name: string;
  subject_name: string;
  total_marks: number;
  result_count: number;
};

export default function ExamPapersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuthStore();
  const queryKey = ["exam-papers-page", user?.org_id, user?.id] as const;
  const { data, isPending: loading, isError } = useQuery<ExamPapersData>({
    queryKey,
    enabled: !authLoading && Boolean(user),
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const [papers, exams, classrooms, subjects] = await Promise.all([
        api.get<ExamPaper[]>("/exam-papers", { signal }),
        api.get<Exam[]>("/exams", { signal }),
        api.get<Classroom[]>("/classes", { signal }),
        api.get<Subject[]>("/subjects", { signal }),
      ]);
      return {
        papers: Array.isArray(papers.data) ? papers.data : [],
        exams: Array.isArray(exams.data) ? exams.data : [],
        classrooms: Array.isArray(classrooms.data) ? classrooms.data : [],
        subjects: Array.isArray(subjects.data) ? subjects.data : [],
      };
    },
  });
  const { papers = [], exams = [], classrooms = [], subjects = [] } = data ?? {};
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState<number | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PaperForm>(emptyPaperForm);
  const [saving, setSaving] = useState(false);
  const [deletionPreview, setDeletionPreview] = useState<ExamPaperDeletionPreview | null>(null);
  const [loadingDeletionPreview, setLoadingDeletionPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reloadPapers = async () => {
    try {
      const { data } = await api.get<ExamPaper[]>("/exam-papers");
      queryClient.setQueryData<ExamPapersData>(queryKey, (current) =>
        current && { ...current, papers: Array.isArray(data) ? data : [] });
    } catch {
      toast.error("Failed to load exam papers");
    }
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/signin");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (isError) toast.error("Failed to load exam paper data");
  }, [isError]);

  const filteredPapers = papers.filter(
    (paper) =>
      (paper.exam_name.toLowerCase().includes(search.toLowerCase()) ||
        paper.subject_name.toLowerCase().includes(search.toLowerCase()) ||
        paper.classroom_name.toLowerCase().includes(search.toLowerCase())) &&
      (examFilter === "all" || paper.exam_id === examFilter),
  );
  const grouped = filteredPapers.reduce<
    Record<string, { examName: string; papers: ExamPaper[] }>
  >((groups, paper) => {
    const key = String(paper.exam_id);
    if (!groups[key]) groups[key] = { examName: paper.exam_name, papers: [] };
    groups[key].papers.push(paper);
    return groups;
  }, {});
  const stats = {
    total: papers.length,
    exams: new Set(papers.map((paper) => paper.exam_id)).size,
    subjects: new Set(papers.map((paper) => paper.subject_id)).size,
    passRate: papers.length
      ? Math.round(
          (papers.reduce(
            (total, paper) =>
              total + paper.pass_marks / Math.max(paper.total_marks, 1),
            0,
          ) /
            papers.length) *
            100,
        )
      : 0,
  };
  const noExams = exams.length === 0;
  const canDeletePapers = user?.org_role === "admin";

  const openAdd = () => {
    setForm({ ...emptyPaperForm, exam_id: exams[0]?.id ?? 0 });
    setEditingId(null);
    setDialogOpen(true);
  };
  const openEdit = (paper: ExamPaper) => {
    setForm({
      exam_id: paper.exam_id,
      classroom_id: paper.classroom_id,
      subject_id: paper.subject_id,
      total_marks: paper.total_marks,
      pass_marks: paper.pass_marks,
    });
    setEditingId(paper.id);
    setDialogOpen(true);
  };
  const savePaper = async () => {
    if (
      !form.exam_id ||
      !form.classroom_id ||
      !form.subject_id ||
      form.pass_marks > form.total_marks
    )
      return;
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/exam-papers/${editingId}`, {
          total_marks: Number(form.total_marks),
          pass_marks: Number(form.pass_marks),
        });
        toast.success("Exam paper updated");
      } else {
        await api.post("/exam-papers", form);
        toast.success("Exam paper created");
      }
      setDialogOpen(false);
      await reloadPapers();
    } catch (error: unknown) {
      toast.error(
        (error as ApiError).response?.data?.detail ??
          "Failed to save exam paper",
      );
    } finally {
      setSaving(false);
    }
  };
  const openDelete = async (paper: ExamPaper) => {
    if (!canDeletePapers || loadingDeletionPreview) return;
    setLoadingDeletionPreview(true);
    try {
      const { data } = await api.get<ExamPaperDeletionPreview>(`/exam-papers/${paper.id}/deletion-preview`);
      setDeletionPreview(data);
    } catch (error: unknown) {
      toast.error(
        (error as ApiError).response?.data?.detail ??
          "Could not prepare exam paper deletion",
      );
    } finally {
      setLoadingDeletionPreview(false);
    }
  };
  const confirmDelete = async () => {
    if (!deletionPreview || deleting) return;
    setDeleting(true);
    try {
      const { data } = await api.delete<{ deleted_marks: number }>(`/exam-papers/${deletionPreview.paper_id}`);
      toast.success(`Exam paper deleted with ${data.deleted_marks} ${data.deleted_marks === 1 ? "student mark" : "student marks"}`);
      setDeletionPreview(null);
      await Promise.all([
        reloadPapers(),
        queryClient.invalidateQueries({ queryKey: ["exam-entry"] }),
        queryClient.invalidateQueries({ queryKey: ["dmc"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
    } catch (error: unknown) {
      toast.error(
        (error as ApiError).response?.data?.detail ??
          "Cannot delete exam paper",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader
        title="Exam Papers"
        subtitle="Assign subjects and mark schemes to exams per classroom"
        actions={<div className="flex flex-wrap gap-2"><button type="button" onClick={openAdd} disabled={noExams} className={primaryButtonClass}>Add Exam Paper</button>{user?.org_role === "admin" && <button type="button" onClick={() => setBulkOpen(true)} disabled={noExams || loading} className={secondaryButtonClass}>Add Multiple Papers</button>}</div>}
      />
      {!loading && noExams && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              No exams available
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
              Exam papers must be linked to an exam. Create an exam first.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/exams")}
            className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/10"
          >
            Go to Exams
          </button>
        </div>
      )}
      <StatGrid
        stats={[
          {
            label: "Total Papers",
            value: stats.total,
            Icon: FileText,
            tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]",
          },
          {
            label: "Exams Covered",
            value: stats.exams,
            Icon: Trophy,
            tone: "border-blue-400/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400",
          },
          {
            label: "Subjects",
            value: stats.subjects,
            Icon: BookOpen,
            tone: "border-violet-400/20 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-400",
          },
          {
            label: "Avg Pass Rate",
            value: `${stats.passRate}%`,
            Icon: GraduationCap,
            tone: "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400",
          },
        ]}
      />
      <div className="mb-6 grid gap-3 md:grid-cols-12">
        <div className="relative md:col-span-8">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by exam, subject or class…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={examFilter}
          onChange={(event) =>
            setExamFilter(
              event.target.value === "all" ? "all" : Number(event.target.value),
            )
          }
          className={`${inputClass} md:col-span-4`}
        >
          <option value="all">All Exams</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
      </div>
      {loading || authLoading ? (
        <LoadingState />
      ) : filteredPapers.length === 0 ? (
        <EmptyState
          icon={FileText}
          message={
            search
              ? "No papers match your search"
              : "No exam papers yet — add your first one"
          }
          actionLabel={noExams ? undefined : "Add Exam Paper"}
          onAction={openAdd}
        />
      ) : (
        <PapersList
          grouped={grouped}
          onEdit={openEdit}
          onDelete={openDelete}
          canDelete={canDeletePapers}
        />
      )}
      {dialogOpen && (
        <PaperFormModal
          form={form}
          exams={exams}
          classrooms={classrooms}
          subjects={subjects}
          editing={Boolean(editingId)}
          saving={saving}
          onChange={setForm}
          onClose={() => setDialogOpen(false)}
          onSave={savePaper}
        />
      )}
      {bulkOpen && <BulkPaperFormModal exams={exams} classrooms={classrooms} papers={papers} onClose={() => setBulkOpen(false)} onCreated={async (result) => {
        toast.success(`${result.created_count} papers created, ${result.skipped_count} skipped`);
        await reloadPapers();
        await queryClient.invalidateQueries({ queryKey: ["exam-entry"] });
      }} />}
      {deletionPreview && (
        <DeleteModal
          title="Delete Exam Paper?"
          loading={deleting}
          onClose={() => setDeletionPreview(null)}
          onConfirm={confirmDelete}
        >
          <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
            <dl className="grid gap-1.5">
              <div><dt className="inline font-semibold">Examination: </dt><dd className="inline">{deletionPreview.exam_name}</dd></div>
              <div><dt className="inline font-semibold">Class: </dt><dd className="inline">{deletionPreview.classroom_name}</dd></div>
              <div><dt className="inline font-semibold">Subject: </dt><dd className="inline">{deletionPreview.subject_name}</dd></div>
              <div><dt className="inline font-semibold">Total marks: </dt><dd className="inline">{deletionPreview.total_marks}</dd></div>
              <div><dt className="inline font-semibold">Student marks to delete: </dt><dd className="inline">{deletionPreview.result_count}</dd></div>
            </dl>
            <p className="mt-4 font-semibold text-red-600 dark:text-red-400">Deleting this exam paper will permanently remove its associated student marks. This action cannot be undone.</p>
          </div>
        </DeleteModal>
      )}
    </div>
  );
}

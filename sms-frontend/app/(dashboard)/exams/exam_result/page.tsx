"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  GraduationCap,
  Lock,
  Save,
  Search,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import DeleteModal from "@/components/exams/DeleteModal";
import ResultEntryTable from "@/components/exams/ResultEntryTable";
import ResultStudentPicker from "@/components/exams/ResultStudentPicker";
import StudentResultsList from "@/components/exams/StudentResultsList";
import {
  EmptyState,
  LoadingState,
  PageHeader,
  StatGrid,
  inputClass,
} from "@/components/exams/ExamUi";
import type {
  ApiError,
  Exam,
  ExamPaper,
  ExamResult,
  ResultStudent,
} from "@/components/exams/types";

type ViewMode = "by-exam" | "by-student";
type BulkResultResponse = { succeeded?: ExamResult[]; failed?: unknown[] };

export default function ExamResultsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [viewMode, setViewMode] = useState<ViewMode>("by-exam");
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [students, setStudents] = useState<ResultStudent[]>([]);
  const [allStudents, setAllStudents] = useState<ResultStudent[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [studentResults, setStudentResults] = useState<ExamResult[]>([]);
  const [selectedExam, setSelectedExam] = useState(0);
  const [selectedPaper, setSelectedPaper] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState(0);
  const [localMarks, setLocalMarks] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentListLoading, setStudentListLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/signin");
      return;
    }
    const loadPage = async () => {
      try {
        const [examsResponse, papersResponse] = await Promise.all([
          api.get("/exams"),
          api.get("/exam-papers"),
        ]);
        setExams(Array.isArray(examsResponse.data) ? examsResponse.data : []);
        setPapers(Array.isArray(papersResponse.data) ? papersResponse.data : []);
      } catch {
        toast.error("Failed to load exam data");
      } finally {
        setLoading(false);
      }
    };
    void loadPage();
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!selectedExam) return;
    const loadExamResults = async () => {
      try {
        const response = await api.get(`/exam-results/exam/${selectedExam}`);
        setExamResults(Array.isArray(response.data) ? response.data : []);
      } catch {
        setExamResults([]);
      }
    };
    void loadExamResults();
  }, [selectedExam]);

  useEffect(() => {
    if (!selectedPaper) return;
    const paper = papers.find((item) => item.id === selectedPaper);
    if (!paper) return;
    const loadStudents = async () => {
      setStudentsLoading(true);
      try {
        const response = await api.get(`/students/by-class/${paper.classroom_id}`);
        setStudents(Array.isArray(response.data) ? response.data : []);
      } catch {
        toast.error("Failed to load students");
        setStudents([]);
      } finally {
        setStudentsLoading(false);
      }
    };
    void loadStudents();
  }, [papers, selectedPaper]);

  useEffect(() => {
    if (viewMode !== "by-student" || allStudents.length > 0) return;
    const loadAllStudents = async () => {
      setStudentListLoading(true);
      try {
        const response = await api.get("/students", { params: { limit: 200 } });
        setAllStudents(
          Array.isArray(response.data) ? response.data : (response.data.items ?? [])
        );
      } catch {
        toast.error("Failed to load students");
      } finally {
        setStudentListLoading(false);
      }
    };
    void loadAllStudents();
  }, [allStudents.length, viewMode]);

  useEffect(() => {
    if (!selectedStudent || viewMode !== "by-student") return;
    const loadStudentResults = async () => {
      try {
        const response = await api.get(`/exam-results/student/${selectedStudent}`);
        setStudentResults(Array.isArray(response.data) ? response.data : []);
      } catch (error: unknown) {
        if ((error as ApiError).response?.status !== 404) {
          toast.error("Failed to load results");
        }
        setStudentResults([]);
      }
    };
    void loadStudentResults();
  }, [selectedStudent, viewMode]);

  const papersForExam = papers.filter((paper) => paper.exam_id === selectedExam);
  const currentPaper = papers.find((paper) => paper.id === selectedPaper);
  const currentExam = exams.find((exam) => exam.id === selectedExam);
  const isLocked = currentExam?.is_locked ?? false;
  const paperResults = examResults.filter(
    (result) => result.exam_paper_id === selectedPaper
  );
  const filteredStudents = students.filter(
    (student) =>
      `${student.first_name} ${student.last_name}`
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (student.admission_no ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const stats = {
    entered: paperResults.length,
    passing: currentPaper
      ? paperResults.filter((result) => result.obtained_marks >= currentPaper.pass_marks)
          .length
      : 0,
    graded: paperResults.filter((result) => result.grade).length,
    average:
      paperResults.length && currentPaper
        ? Math.round(
            paperResults.reduce(
              (total, result) =>
                total + (result.obtained_marks / Math.max(currentPaper.total_marks, 1)) * 100,
              0
            ) / paperResults.length
          )
        : 0,
  };
  const pendingCount = Object.entries(localMarks).filter(([, mark]) => mark !== "").length;
  const selectedResult = [...examResults, ...studentResults].find(
    (result) => result.id === deleteId
  );

  const selectExam = (examId: number) => {
    setSelectedExam(examId);
    setSelectedPaper(0);
    setStudents([]);
    setExamResults([]);
    setLocalMarks({});
    setSearch("");
  };

  const selectPaper = (paperId: number) => {
    setSelectedPaper(paperId);
    setStudents([]);
    setLocalMarks({});
    setSearch("");
  };

  const updateMark = (enrollmentId: number, mark: string) =>
    setLocalMarks((current) => ({ ...current, [enrollmentId]: mark }));

  const saveBulkResults = async () => {
    if (!currentPaper || isLocked) return;
    const payload = Object.entries(localMarks)
      .filter(
        ([, mark]) =>
          mark !== "" && Number(mark) >= 0 && Number(mark) <= currentPaper.total_marks
      )
      .map(([enrollmentId, mark]) => ({
        exam_paper_id: selectedPaper,
        student_enrollment_id: Number(enrollmentId),
        obtained_marks: Number(mark),
      }));
    if (payload.length === 0) {
      toast.error("No valid marks to save");
      return;
    }
    setBulkSaving(true);
    try {
      const response = await api.post("/exam-results/bulk", payload);
      const body = response.data as BulkResultResponse;
      const succeeded = Array.isArray(body.succeeded) ? body.succeeded : [];
      const failed = Array.isArray(body.failed) ? body.failed : [];
      if (succeeded.length > 0) {
        setExamResults((current) => {
          const withoutUpdated = current.filter(
            (result) => !succeeded.some((saved) => saved.id === result.id)
          );
          return [...withoutUpdated, ...succeeded];
        });
        setLocalMarks({});
        toast.success(`${succeeded.length} result${succeeded.length === 1 ? "" : "s"} saved`);
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} row${failed.length === 1 ? "" : "s"} failed`);
      }
    } catch (error: unknown) {
      toast.error((error as ApiError).response?.data?.detail ?? "Bulk save failed");
    } finally {
      setBulkSaving(false);
    }
  };

  const deleteResult = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/exam-results/${deleteId}`);
      setExamResults((current) => current.filter((result) => result.id !== deleteId));
      setStudentResults((current) => current.filter((result) => result.id !== deleteId));
      setDeleteId(null);
      toast.success("Result deleted");
    } catch (error: unknown) {
      toast.error((error as ApiError).response?.data?.detail ?? "Failed to delete result");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader
        title="Exam Results"
        subtitle="Enter marks by exam paper or review a student’s report card"
      />

      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
        <button
          type="button"
          onClick={() => setViewMode("by-exam")}
          className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
            viewMode === "by-exam"
              ? "bg-[#8B6DF2] text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          Enter by Exam
        </button>
        <button
          type="button"
          onClick={() => setViewMode("by-student")}
          className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
            viewMode === "by-student"
              ? "bg-[#8B6DF2] text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
        >
          View by Student
        </button>
      </div>

      {loading || authLoading ? (
        <LoadingState />
      ) : viewMode === "by-exam" ? (
        <section>
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
            <h2 className="mb-4 text-sm font-bold text-slate-900 dark:text-slate-50">
              Select Exam &amp; Paper
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Exam
                <select
                  value={selectedExam}
                  onChange={(event) => selectExam(Number(event.target.value))}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value={0} disabled>
                    Choose an exam
                  </option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name}
                      {exam.is_locked ? " · Locked" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Subject / Class
                <select
                  value={selectedPaper}
                  disabled={!selectedExam}
                  onChange={(event) => selectPaper(Number(event.target.value))}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value={0} disabled>
                    {!selectedExam ? "Choose an exam first" : "Choose a subject and class"}
                  </option>
                  {papersForExam.map((paper) => (
                    <option key={paper.id} value={paper.id}>
                      {paper.subject_name} — {paper.classroom_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {currentPaper && (
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  {
                    label: "Total Marks",
                    value: currentPaper.total_marks,
                    tone: "text-[#8B6DF2] border-[#8B6DF2]/20 bg-[#8B6DF2]/10",
                  },
                  {
                    label: "Pass Marks",
                    value: currentPaper.pass_marks,
                    tone:
                      "text-emerald-600 border-emerald-400/20 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-400/20 dark:bg-emerald-500/10",
                  },
                  {
                    label: "Students",
                    value: studentsLoading ? "…" : students.length,
                    tone:
                      "text-blue-600 border-blue-400/20 bg-blue-50 dark:text-blue-400 dark:border-blue-400/20 dark:bg-blue-500/10",
                  },
                  {
                    label: "Entered",
                    value: paperResults.length,
                    tone:
                      "text-violet-600 border-violet-400/20 bg-violet-50 dark:text-violet-400 dark:border-violet-400/20 dark:bg-violet-500/10",
                  },
                ].map(({ label, value, tone }) => (
                  <span key={label} className={`rounded-lg border px-3 py-2 ${tone}`}>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {label}
                    </span>
                    <span className="text-sm font-bold">{value}</span>
                  </span>
                ))}
                {isLocked && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-red-400/25 bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 dark:border-red-400/20 dark:bg-red-500/10">
                    <Lock size={14} />
                    Exam locked — editing disabled
                  </span>
                )}
              </div>
            )}
          </div>

          {currentPaper && paperResults.length > 0 && (
            <StatGrid
              stats={[
                {
                  label: "Entered",
                  value: stats.entered,
                  Icon: FileText,
                  tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]",
                },
                {
                  label: "Passing",
                  value: stats.passing,
                  Icon: CheckCircle2,
                  tone:
                    "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400",
                },
                {
                  label: "Graded",
                  value: stats.graded,
                  Icon: GraduationCap,
                  tone:
                    "border-blue-400/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400",
                },
                {
                  label: "Avg Score",
                  value: `${stats.average}%`,
                  Icon: ClipboardList,
                  tone:
                    "border-violet-400/20 bg-violet-50 text-violet-600 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-400",
                },
              ]}
            />
          )}

          {!selectedPaper ? (
            <EmptyState
              icon={ClipboardList}
              message={
                !selectedExam
                  ? "Select an exam to begin"
                  : papersForExam.length === 0
                    ? "No exam papers are set up for this exam yet"
                    : "Select a subject and class to enter marks"
              }
            />
          ) : studentsLoading ? (
            <LoadingState />
          ) : !currentPaper ? (
            <EmptyState
              icon={ClipboardList}
              message="Select a paper to view results"
            />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search students…"
                    className={`${inputClass} pl-9`}
                  />
                </div>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={saveBulkResults}
                    disabled={bulkSaving || pendingCount === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save size={16} />
                    {bulkSaving ? "Saving…" : `Save All${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
                  </button>
                )}
              </div>
              {filteredStudents.length === 0 ? (
                <EmptyState icon={UserRound} message="No students found for this class" />
              ) : (
                <ResultEntryTable
                  students={filteredStudents}
                  paper={currentPaper}
                  results={paperResults}
                  localMarks={localMarks}
                  locked={isLocked}
                  onMarkChange={updateMark}
                />
              )}
            </>
          )}
        </section>
      ) : (
        <section>
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
            <h2 className="mb-4 text-sm font-bold text-slate-900 dark:text-slate-50">
              Select Student
            </h2>
            {studentListLoading ? (
              <LoadingState />
            ) : (
              <ResultStudentPicker
                students={allStudents}
                selectedStudent={selectedStudent}
                search={studentSearch}
                onSearchChange={setStudentSearch}
                onSelect={setSelectedStudent}
              />
            )}
          </div>
          {selectedStudent > 0 &&
            (studentResults.length === 0 ? (
              <EmptyState icon={GraduationCap} message="No results found for this student" />
            ) : (
              <StudentResultsList
                results={studentResults}
                papers={papers}
                onDelete={(result) => setDeleteId(result.id)}
              />
            ))}
        </section>
      )}

      {deleteId !== null && (
        <DeleteModal
          title="Delete Result?"
          description={`This result${
            selectedResult ? " can be re-entered at any time." : " can be re-entered at any time."
          }`}
          loading={deleting}
          onClose={() => setDeleteId(null)}
          onConfirm={deleteResult}
        />
      )}
    </div>
  );
}
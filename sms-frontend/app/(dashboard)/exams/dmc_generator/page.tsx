"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Download,
  FileText,
  GraduationCap,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import DmcPreview from "@/components/exams/DmcPreview";
import {
  EmptyState,
  LoadingState,
  PageHeader,
  inputClass,
} from "@/components/exams/ExamUi";
import type {
  ApiError,
  Classroom,
  DmcStudent,
  Exam,
  ExamPaper,
  ExamResult,
} from "@/components/exams/types";
import { classroomLabel } from "@/components/exams/types";

export default function DmcPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<DmcStudent[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [selectedExam, setSelectedExam] = useState(0);
  const [selectedClassroom, setSelectedClassroom] = useState(0);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [generating, setGenerating] = useState<2 | 3 | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/signin");
      return;
    }
    const loadPage = async () => {
      try {
        const [examsResponse, papersResponse, classesResponse] =
          await Promise.all([
            api.get("/exams"),
            api.get("/exam-papers"),
            api.get("/classes"),
          ]);
        setExams(Array.isArray(examsResponse.data) ? examsResponse.data : []);
        setPapers(
          Array.isArray(papersResponse.data) ? papersResponse.data : [],
        );
        setClassrooms(
          Array.isArray(classesResponse.data) ? classesResponse.data : [],
        );
      } catch {
        toast.error("Failed to load DMC data");
      } finally {
        setLoading(false);
      }
    };
    void loadPage();
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!selectedExam || !selectedClassroom) return;
    const loadClassData = async () => {
      setStudentsLoading(true);
      try {
        const [studentsResponse, resultsResponse] = await Promise.all([
          api.get(`/students/by-class/${selectedClassroom}`),
          api.get(`/exam-results/exam/${selectedExam}`),
        ]);
        setStudents(
          Array.isArray(studentsResponse.data) ? studentsResponse.data : [],
        );
        setResults(
          Array.isArray(resultsResponse.data) ? resultsResponse.data : [],
        );
      } catch {
        toast.error("Failed to load class data");
      } finally {
        setStudentsLoading(false);
      }
    };
    void loadClassData();
  }, [selectedClassroom, selectedExam]);

  const classroomsForExam = selectedExam
    ? classrooms.filter((classroom) =>
        papers.some(
          (paper) =>
            paper.exam_id === selectedExam &&
            paper.classroom_id === classroom.id,
        ),
      )
    : [];
  const papersForClass = papers.filter(
    (paper) =>
      paper.exam_id === selectedExam &&
      paper.classroom_id === selectedClassroom,
  );
  const classPaperIds = new Set(papersForClass.map((paper) => paper.id));
  const classResults = results.filter((result) =>
    classPaperIds.has(result.exam_paper_id),
  );
  const activeEnrollmentIds = new Set(
    students.map((student) => student.enrollment_id),
  );
  const enteredCount = new Set(
    classResults
      .filter((result) => activeEnrollmentIds.has(result.student_enrollment_id))
      .map((result) => result.student_enrollment_id),
  ).size;
  const readyToGenerate =
    selectedExam > 0 && selectedClassroom > 0 && enteredCount > 0;

  const changeExam = (examId: number) => {
    setSelectedExam(examId);
    setSelectedClassroom(0);
    setStudents([]);
    setResults([]);
  };
  const changeClassroom = (classroomId: number) => {
    setSelectedClassroom(classroomId);
    setStudents([]);
    setResults([]);
  };
  const downloadDmc = async (layout: 2 | 3) => {
    if (!readyToGenerate || studentsLoading || generating !== null) {
      return;
    }

    setGenerating(layout);

    try {
      const response = await api.get(
        `/dmc/exam/${selectedExam}/class/${selectedClassroom}`,
        {
          params: { layout },
          responseType: "blob",
        },
      );

      const blob = new Blob([response.data], {
        type: "application/pdf",
      });

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");

      const exam = exams.find((item) => item.id === selectedExam);

      const classroom = classrooms.find(
        (item) => item.id === selectedClassroom,
      );

      link.href = url;

      link.download = `DMC_${exam?.name ?? "Exam"}_${classroomLabel(
        classroom ?? {
          id: 0,
          grade_name: "Class",
          section: "",
        },
      )}_${layout}_per_A4.pdf`.replace(/\s+/g, "_");

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);

      toast.success(`${layout} DMCs per A4 downloaded`);
    } catch (error: unknown) {
      const status = (error as ApiError).response?.status;

      if (status === 409) {
        toast.error(
          "Some students have missing marks. Complete their results first.",
        );
      } else if (status === 404) {
        toast.error("No results found for this class");
      } else {
        toast.error("Failed to generate DMC");
      }
    } finally {
      setGenerating(null);
    }
  };

  const downloadLabel = generating
    ? "Generating PDF…"
    : !selectedExam
      ? "Select an exam first"
      : !selectedClassroom
        ? "Select a class"
        : enteredCount === 0
          ? "No results entered yet"
          : `Download DMC — ${enteredCount} Student${enteredCount === 1 ? "" : "s"}`;
  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader
        title="Generate DMC"
        subtitle="Select an exam and class, then download Detailed Marks Certificates"
      />
      {loading || authLoading ? (
        <LoadingState />
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
            <h2 className="mb-4 text-sm font-bold text-slate-900 dark:text-slate-50">
              Select Exam & Class
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Exam
                <select
                  value={selectedExam}
                  onChange={(event) => changeExam(Number(event.target.value))}
                  className={`${inputClass} mt-1.5`}
                >
                  <option value={0} disabled>
                    Choose an exam
                  </option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name}
                      {exam.is_published ? " · Published" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Class
                <select
                  value={selectedClassroom}
                  disabled={!selectedExam || classroomsForExam.length === 0}
                  onChange={(event) =>
                    changeClassroom(Number(event.target.value))
                  }
                  className={`${inputClass} mt-1.5`}
                >
                  <option value={0} disabled>
                    {!selectedExam ? "Choose an exam first" : "Choose a class"}
                  </option>
                  {classroomsForExam.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroomLabel(classroom)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedClassroom > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: "Students",
                    value: studentsLoading ? "…" : students.length,
                    Icon: Users,
                    tone: "text-blue-600 bg-blue-50 border-blue-400/20 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-400/20",
                  },
                  {
                    label: "Subjects",
                    value: papersForClass.length,
                    Icon: BookOpen,
                    tone: "text-[#8B6DF2] bg-[#8B6DF2]/10 border-[#8B6DF2]/20",
                  },
                  {
                    label: "Entered",
                    value: studentsLoading ? "…" : enteredCount,
                    Icon: FileText,
                    tone: "text-emerald-600 bg-emerald-50 border-emerald-400/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-400/20",
                  },
                  {
                    label: "Missing",
                    value: studentsLoading
                      ? "…"
                      : Math.max(0, students.length - enteredCount),
                    Icon: GraduationCap,
                    tone: "text-red-500 bg-red-50 border-red-400/20 dark:bg-red-500/10 dark:border-red-400/20",
                  },
                ].map(({ label, value, Icon, tone }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.02]"
                  >
                    <span
                      className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg border ${tone}`}
                    >
                      <Icon size={16} />
                    </span>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-50">
                      {value}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            )}
           <div className="mt-5 grid gap-3 sm:grid-cols-2">
  <button
    type="button"
    onClick={() => downloadDmc(2)}
    disabled={
      !readyToGenerate ||
      generating !== null ||
      studentsLoading
    }
    className="flex items-center justify-center gap-2 rounded-lg border border-[#8B6DF2] px-4 py-3 text-sm font-semibold text-[#8B6DF2] transition-colors hover:bg-[#8B6DF2]/10 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <Download size={17} />
    {generating === 2
      ? "Generating..."
      : "Download DMC — 2 per A4"}
  </button>

  <button
    type="button"
    onClick={() => downloadDmc(3)}
    disabled={
      !readyToGenerate ||
      generating !== null ||
      studentsLoading
    }
    className="flex items-center justify-center gap-2 rounded-lg bg-[#8B6DF2] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <Download size={17} />
    {generating === 3
      ? "Generating..."
      : "Download DMC — 3 per A4"}
  </button>
</div>
          </section>
          {selectedClassroom === 0 ? (
            <EmptyState
              icon={GraduationCap}
              message="Select an exam and class to preview results and generate DMCs"
            />
          ) : studentsLoading ? (
            <LoadingState />
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              message="No students found for this class"
            />
          ) : (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    Result Preview
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {enteredCount}/{students.length} student results entered
                  </p>
                </div>
              </div>
              <DmcPreview
                students={students}
                papers={papersForClass}
                results={classResults}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

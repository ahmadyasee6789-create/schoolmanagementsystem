"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { usePaginatedQuery } from "@/app/hooks/usePaginatedQuery";
import { useAuthStore } from "@/app/store/authStore";
import toast from "react-hot-toast";
import StudentImportPreview, {
  ImportPreviewData,
} from "@/components/students/StudentImportPreview";
import StudentToolbar from "@/components/students/Studenttoolbar";
import StudentTable from "@/components/students/Studenttable";
import Pagination from "@/components/students/Pagination";
import StudentFormDialog from "@/components/students/Studentformdialog";
import DeleteConfirmDialog from "@/components/students/Deleteconfirmdialog";
import {
  ApiError,
  Classroom,
  Grade,
  Student,
  StudentFormData,
  emptyStudentForm,
} from "@/components/students/types";

export default function StudentsPage() {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<string | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StudentFormData>(emptyStudentForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const { user, hydrated } = useAuthStore();

  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(
    null,
  );
  const [importFile, setImportFile] = useState<File | null>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!hydrated || !user) return;
    Promise.all([
      api.get("/classes"),
      api.get("/grades"),
      api.get("/sessions/active"),
    ])
      .then(([classrooms, gradeList, session]) => {
        setClasses(classrooms.data);
        setGrades(gradeList.data);
        setActiveSessionId(session.data?.id ?? null);
      })
      .catch((error) =>
        console.error("Failed to fetch student form data:", error),
      )
      .finally(() => setLoadingClasses(false));
  }, [user, hydrated]);

  const {
    data: students = [],
    loading,
    refetch,
    page,
    totalPages,
    setPage,
  } = usePaginatedQuery({
    fetcher: async ({
      page: currentPage,
      limit,
      search: query,
      grade_name,
    }) => {
      const response = await api.get("/students", {
        params: { page: currentPage, limit, search: query, grade_name },
      });
      const data = Array.isArray(response.data)
        ? response.data
        : (response.data.items ?? []);
      const pageCount = Array.isArray(response.data)
        ? 1
        : (response.data.total_pages ?? 1);
      return { data, totalPages: pageCount };
    },
    filters: {
      search,
      grade_name: gradeFilter !== "all" ? gradeFilter : undefined,
    },
    debounceKeys: ["search"],
  });

  const updateForm = <K extends keyof StudentFormData>(
    key: K,
    value: StudentFormData[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));

  const openAddDialog = () => {
    setForm(emptyStudentForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEditDialog = (student: Student) => {
    setForm({
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      phone: student.phone || "",
      email: student.email || "",
      father_name: student.father_name || "",
      father_phone: student.father_phone || "",
      mother_name: student.mother_name || "",
      guardian_name: student.guardian_name || "",
      guardian_phone: student.guardian_phone || "",
      gender: student.gender,
      date_of_birth: student.date_of_birth,
      classroom_id: 0,
      discount_percent: student.discount_percent || 0,
      enrollment_date: new Date().toISOString().split("T")[0],
    });
    setEditingId(student.id);
    setDialogOpen(true);
  };

  const saveStudent = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, {
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone || null,
          email: form.email || null,
          father_name: form.father_name || null,
          father_phone: form.father_phone || null,
          mother_name: form.mother_name || null,
          guardian_name: form.guardian_name || null,
          guardian_phone: form.guardian_phone || null,
          gender: form.gender,
          date_of_birth: form.date_of_birth || null,
        });
      } else {
        await api.post("/students/with-enrollment", {
          ...form,
          phone: form.phone || null,
          email: form.email || null,
          father_name: form.father_name || null,
          father_phone: form.father_phone || null,
          mother_name: form.mother_name || null,
          guardian_name: form.guardian_name || null,
          guardian_phone: form.guardian_phone || null,
          date_of_birth: form.date_of_birth || null,
          classroom_id: Number(form.classroom_id),
          session_id: activeSessionId,
          discount_percent: Number(form.discount_percent) || 0,
        });
      }
      toast.success(editingId ? "Student updated" : "Student added");
      setDialogOpen(false);
      refetch();
    } catch (error: unknown) {
      toast.error(
        (error as ApiError).response?.data?.detail || "Something went wrong",
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${deleteId}`);
      toast.success("Student deleted");
      setDeleteId(null);
      refetch();
    } catch (error: unknown) {
      toast.error(
        (error as ApiError).response?.data?.detail ||
          "Failed to delete student",
      );
    } finally {
      setDeleting(false);
    }
  };

  // Step 1 of the import flow: upload the file, get a preview back so the
  // user can review/map columns before anything is written to the database.
  const handleImportFile = async (file: File) => {
    setImportFile(file);
    const formData = new FormData();
    formData.append("file", file);
    setImporting(true);
    try {
      const response = await api.post("/students/import/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview(response.data);
      toast.success("Import preview loaded");
    } catch (error: unknown) {
      toast.error(
        (error as ApiError).response?.data?.detail || "Import failed",
      );
      setImportFile(null);
    } finally {
      setImporting(false);
    }
  };

  // Step 2 (the fix): actually commit the import using the file from step 1
  // plus whatever column mapping the preview dialog produced. Previously
  // this just console.log'd the mapping and never touched the backend.
  //
  // NOTE: adjust the endpoint path / payload shape to match your real
  // backend contract for confirming an import if it differs from this.
  const confirmImport = async (mapping: Record<string, string>) => {
    if (!importFile) {
      toast.error("No file to import — please re-upload and try again");
      return;
    }
    setImporting(true);
    const formData = new FormData();
    formData.append("file", importFile);
    formData.append("mapping", JSON.stringify(mapping));
    if (activeSessionId) formData.append("session_id", String(activeSessionId));

    try {
      const response = await api.post("/students/import/confirm", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const imported = response.data?.imported ?? 0;
      const skipped = response.data?.skipped ?? 0;
      toast.success(
        skipped
          ? `Imported ${imported} student${imported === 1 ? "" : "s"}, skipped ${skipped}`
          : `Imported ${imported} student${imported === 1 ? "" : "s"}`,
      );
      setImportPreview(null);
      setImportFile(null);
      refetch();
    } catch (error: unknown) {
      toast.error(
        (error as ApiError).response?.data?.detail || "Import failed",
      );
    } finally {
      setImporting(false);
    }
  };

  const closeImportPreview = () => {
    setImportPreview(null);
    setImportFile(null);
  };

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <StudentToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        gradeFilter={gradeFilter}
        onGradeFilterChange={(value) => {
          setGradeFilter(value);
          setPage(1);
        }}
        grades={grades}
        importing={importing}
        onImportFile={handleImportFile}
        onAdd={openAddDialog}
      />

      <StudentTable
        students={students as Student[]}
        loading={loading}
        onEdit={openEditDialog}
        onDelete={setDeleteId}
        onAddFirst={openAddDialog}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <StudentFormDialog
        open={dialogOpen}
        form={form}
        updateForm={updateForm}
        editingId={editingId}
        saving={saving}
        classes={classes}
        loadingClasses={loadingClasses}
        activeSessionId={activeSessionId}
        onClose={() => setDialogOpen(false)}
        onSave={saveStudent}
      />

      {importPreview && (
        <StudentImportPreview
          data={importPreview}
          onClose={closeImportPreview}
          onImport={confirmImport}
        />
      )}

      <DeleteConfirmDialog
        open={deleteId !== null}
        deleting={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
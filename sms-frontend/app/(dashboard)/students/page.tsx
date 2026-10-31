"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { studentKeys, useStudents } from "@/app/hooks/useStudents";
import { studentApiError } from "@/app/lib/studentApi";
import EditStudentDialog from "@/components/students/EditStudentDialog";
import { StudentError } from "@/components/students/StudentDetailStates";
import { useAuthStore } from "@/app/store/authStore";
import toast from "react-hot-toast";
import StudentImportPreview, {
  ImportPreviewData,
} from "@/components/students/StudentImportPreview";
import { importError } from "@/components/students/importTypes";
import StudentToolbar from "@/components/students/Studenttoolbar";
import StudentTable from "@/components/students/Studenttable";
import Pagination from "@/components/students/Pagination";
import StudentFormDialog from "@/components/students/Studentformdialog";
import DeleteConfirmDialog from "@/components/students/Deleteconfirmdialog";
import {
  ApiError,
  Classroom,
  Grade,
  StudentFormData,
  emptyStudentForm,
} from "@/components/students/types";

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
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

  const studentQuery = useStudents({ page, search, grade: gradeFilter });
  const students = studentQuery.data?.items ?? [];
  const totalPages = studentQuery.data?.total_pages ?? 1;
  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: studentKeys.lists });
  };

  const updateForm = <K extends keyof StudentFormData>(
    key: K,
    value: StudentFormData[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));

  const openAddDialog = () => {
    setForm(emptyStudentForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const saveStudent = async () => {
    setSaving(true);
    try {
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
      toast.success("Student added");
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
      queryClient.removeQueries({ queryKey: studentKeys.detail(deleteId) });
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

  // Upload stages the file; the dialog owns mapping, validation and confirmation.
  const handleImportFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    setImporting(true);
    try {
      const response = await api.post<ImportPreviewData>("/students/import/preview", formData);
      setImportPreview(response.data);
    } catch (error: unknown) {
      toast.error(importError(error));
    } finally {
      setImporting(false);
    }
  };

  const closeImportPreview = () => {
    setImportPreview(null);
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

      {studentQuery.isError ? <StudentError message={studentApiError(studentQuery.error, "Unable to load students. Please try again.").message} retry={refetch} /> : <StudentTable
        students={students}
        loading={studentQuery.isPending}
        onEdit={(student) => setEditingId(student.id)}
        onDelete={setDeleteId}
        onAddFirst={openAddDialog}
      />}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <StudentFormDialog
        open={dialogOpen}
        form={form}
        updateForm={updateForm}
        editingId={null}
        saving={saving}
        classes={classes}
        loadingClasses={loadingClasses}
        activeSessionId={activeSessionId}
        onClose={() => setDialogOpen(false)}
        onSave={saveStudent}
      />

      {editingId !== null && <EditStudentDialog studentId={editingId} onClose={() => setEditingId(null)} />}

      {importPreview && (
        <StudentImportPreview
          key={importPreview.batch_id}
          data={importPreview}
          onClose={closeImportPreview}
          onImported={refetch}
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

"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import SubjectCard from "@/components/academics/subject/SubjectCard";
import SubjectsTable from "@/components/academics/subject/SubjectsTable";
import AddEditSubjectDialog from "@/components/academics/subject/AddEditSubjectDialog";
import DeleteSubjectDialog from "@/components/academics/subject/DeleteSubjectDialog";

export type Subject = { id: number; name: string };

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSubjects = async () => {
    try {
      const res = await api.get("/subjects");
      setSubjects(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load subjects");
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(search.toLowerCase()),
  );

  const openAdd = () => {
    setEditingSubject(null);
    setSubjectName("");
    setDialogOpen(true);
  };

  const openEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setSubjectName(subject.name);
    setDialogOpen(true);
  };

  const saveSubject = async () => {
    const name = subjectName.trim();
    if (!name) return;

    setSaving(true);
    try {
      if (editingSubject) {
        await api.put(`/subjects/${editingSubject.id}`, { name });
        setSubjects((current) =>
          current.map((subject) =>
            subject.id === editingSubject.id ? { ...subject, name } : subject,
          ),
        );
        toast.success("Subject updated");
      } else {
        await api.post("/subjects", { name });
        toast.success("Subject created");
        await fetchSubjects();
      }

      setDialogOpen(false);
      setEditingSubject(null);
      setSubjectName("");
    } catch (error: any) {
      toast.error(error.response?.data?.detail ?? "Failed to save subject");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    setDeleting(true);
    try {
      await api.delete(`/subjects/${deleteId}`);
      setSubjects((current) => current.filter((subject) => subject.id !== deleteId));
      setDeleteId(null);
      toast.success("Subject deleted");
    } catch (error: any) {
      toast.error(error.response?.data?.detail ?? "Failed to delete subject");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#111827] sm:p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">
            Subjects
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage academic subjects offered in your school
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
        >
          <Plus size={16} />
          Add Subject
        </button>
      </div>

      <div className="relative mb-6 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search subjects…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" />
        </div>
      ) : filteredSubjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10">
          <BookOpen size={32} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {search ? "No subjects match your search" : "No subjects found"}
          </p>
          <button
            onClick={openAdd}
            className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
          >
            Add your first subject
          </button>
        </div>
      ) : (
        <>
          <div className="sm:hidden">
            {filteredSubjects.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                onEdit={() => openEdit(subject)}
                onDelete={() => setDeleteId(subject.id)}
              />
            ))}
          </div>
          <div className="hidden sm:block">
            <SubjectsTable
              subjects={filteredSubjects}
              onEdit={openEdit}
              onDelete={setDeleteId}
            />
          </div>
        </>
      )}

      <AddEditSubjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={Boolean(editingSubject)}
        subjectName={subjectName}
        setSubjectName={setSubjectName}
        onSave={saveSubject}
        saving={saving}
      />

      <DeleteSubjectDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}

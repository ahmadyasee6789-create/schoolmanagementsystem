"use client";

import { useEffect, useState } from "react";
import { BookOpen, GraduationCap, Layers, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";

type Assignment = {
  id: number;
  classroom_id: number;
  classroom_name: string;
  section: string;
  subject_id: number;
  subject_name: string;
};
type ClassItem = { id: number; class_name: string; section: string };
type SubjectItem = { id: number; name: string };
type AssignForm = { classroom_id: number | ""; subject_id: number | "" };
type ApiError = { response?: { data?: { detail?: string } } };

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500";
const secondaryButtonClass =
  "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";

function AssignmentCard({ assignment, onDelete }: { assignment: Assignment; onDelete: () => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#8B6DF2]/40 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10">
              <BookOpen size={15} className="text-[#8B6DF2]" />
            </span>
            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{assignment.subject_name}</p>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <GraduationCap size={13} />
            {assignment.classroom_name} <span aria-hidden>·</span> Section {assignment.section}
          </p>
        </div>
        <button
          type="button"
          title="Remove assignment"
          onClick={onDelete}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-500"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

export default function ClassSubjectsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssignForm>({ classroom_id: "", subject_id: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAssignments = async () => {
    try {
      const res = await api.get("/subjects/assignments");
      setAssignments(res.data);
    } catch {
      toast.error("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.get("/classes").then((res) => setClasses(res.data)),
      api.get("/subjects").then((res) => setSubjects(res.data)),
    ]).catch(() => toast.error("Failed to load data"));
    fetchAssignments();
  }, []);

  const filtered = assignments.filter((assignment) =>
    assignment.subject_name.toLowerCase().includes(search.toLowerCase()) ||
    assignment.classroom_name.toLowerCase().includes(search.toLowerCase()) ||
    assignment.section.toLowerCase().includes(search.toLowerCase()),
  );

  const openAssign = () => {
    setForm({ classroom_id: "", subject_id: "" });
    setOpen(true);
  };

  const handleAssign = async () => {
    if (!form.classroom_id || !form.subject_id) return;
    setSaving(true);
    try {
      await api.post("/subjects/assign-to-class", form);
      toast.success("Subject assigned successfully");
      setOpen(false);
      setForm({ classroom_id: "", subject_id: "" });
      fetchAssignments();
    } catch (error: unknown) {
      toast.error((error as ApiError).response?.data?.detail || "Failed to assign");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/subjects/assignments/${deleteId}`);
      toast.success("Assignment removed");
      setAssignments((previous) => previous.filter((assignment) => assignment.id !== deleteId));
      setDeleteId(null);
    } catch (error: unknown) {
      toast.error((error as ApiError).response?.data?.detail || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">Class Subjects</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage subject assignments across classrooms
          </p>
        </div>
        <button type="button" onClick={openAssign} className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400">
          <Plus size={16} />
          Assign Subject
        </button>
      </div>

      <div className="relative mb-6 max-w-xl">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by subject, class or section…" className={`${inputClass} pl-9`} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10">
          <Layers size={32} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{search ? "No assignments match your search" : "No subject assignments yet"}</p>
          <button type="button" onClick={openAssign} className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Assign your first subject</button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:hidden">
            {filtered.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} onDelete={() => setDeleteId(assignment.id)} />)}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 sm:block">
            <table className="w-full min-w-[650px] border-collapse text-left">
              <thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Class", "Section", "Subject", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{heading}</th>)}</tr></thead>
              <tbody>
                {filtered.map((assignment) => (
                  <tr key={assignment.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100"><span className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><GraduationCap size={15} className="text-[#8B6DF2]" /></span>{assignment.classroom_name}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300"><span className="rounded-md border border-blue-400/25 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400">Section {assignment.section}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300"><span className="flex items-center gap-2"><BookOpen size={14} className="text-slate-400 dark:text-slate-500" />{assignment.subject_name}</span></td>
                    <td className="px-4 py-3"><button type="button" title="Remove assignment" onClick={() => setDeleteId(assignment.id)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-slate-500"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="assign-subject-title">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
            <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2"><Layers size={18} className="text-[#8B6DF2]" /><h2 id="assign-subject-title" className="text-base font-bold text-slate-900 dark:text-slate-50">Assign Subject to Class</h2></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"><X size={18} /></button></div>
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Class <span className="text-red-500">*</span><select value={form.classroom_id} onChange={(event) => setForm({ ...form, classroom_id: Number(event.target.value) })} className={`${inputClass} mt-1.5`}><option value="" disabled>Select class</option>{classes.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.class_name} · Section {classroom.section}</option>)}</select></label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Subject <span className="text-red-500">*</span><select value={form.subject_id} onChange={(event) => setForm({ ...form, subject_id: Number(event.target.value) })} className={`${inputClass} mt-1.5`}><option value="" disabled>Select subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} disabled={saving} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={handleAssign} disabled={saving || !form.classroom_id || !form.subject_id} className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Assigning…" : "Assign Subject"}</button></div>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="remove-subject-title">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
            <h2 id="remove-subject-title" className="text-base font-bold text-slate-900 dark:text-slate-50">Remove assignment?</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">This will unassign the subject from the class.</p>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteId(null)} disabled={deleting} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40">{deleting ? "Removing…" : "Remove"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

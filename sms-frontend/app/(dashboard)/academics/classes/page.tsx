"use client";

import { Fragment, useEffect, useState } from "react";
import { GraduationCap, Layers, Plus, Search, School, Trash2, User, UserPlus, Users, X } from "lucide-react";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import { useAuthStore } from "@/app/store/authStore";
import { useRouter } from "next/navigation";

type ClassType = {
  id: number;
  grade_id?: number;
  grade?: { id: number; name: string };
  grade_name?: string | null;
  section: string;
  class_name: string;
  teacher_id: number | null;
  teacher_name: string | null;
};
type TeacherType = { id: number; full_name: string; email: string };
type Grade = { id: number; name: string };
type Student = { id: number; first_name: string; last_name: string; roll_number: string | null; father_name: string | null; phone: string | null };
type ClassForm = { grade_id: number | string; section: string };
type ApiError = { response?: { data?: { detail?: string } } };

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100";
const secondaryButtonClass = "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";
const actionButtonClass = "rounded-lg p-1.5 text-slate-400 transition-colors dark:text-slate-500";

function classLabel(classroom: ClassType) {
  const grade = classroom.grade?.name ?? classroom.grade_name;
  if (grade && classroom.section) return `${grade} – ${classroom.section}`;
  if (grade) return grade;
  return classroom.class_name || classroom.section || `Class #${classroom.id}`;
}

function ClassCard({ classroom, isAdmin, onAssign, onDelete, onViewStudents }: { classroom: ClassType; isAdmin: boolean; onAssign: () => void; onDelete: () => void; onViewStudents: () => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-[#8B6DF2]/40 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><GraduationCap size={15} className="text-[#8B6DF2]" /></span><p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{classLabel(classroom)}</p></div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><User size={13} />{classroom.teacher_name || "No teacher assigned"}</p>
        </div>
        {isAdmin && <div className="flex gap-1"><button type="button" title={classroom.teacher_name ? "Reassign teacher" : "Assign teacher"} onClick={onAssign} className={`${actionButtonClass} hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2]`}><UserPlus size={16} /></button><button type="button" title="Delete classroom" onClick={onDelete} className={`${actionButtonClass} hover:bg-red-500/10 hover:text-red-500`}><Trash2 size={16} /></button></div>}
      </div>
      <button type="button" onClick={onViewStudents} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-blue-400/25 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400/20 dark:text-blue-400 dark:hover:bg-blue-500/10"><Users size={14} />View Students</button>
    </article>
  );
}

function StudentsDialog({ open, onClose, classId, className }: { open: boolean; onClose: () => void; classId: number; className: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !classId) return;
    const loadStudents = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/students/by-class/${classId}`);
        setStudents(Array.isArray(response.data) ? response.data : []);
      } catch {
        toast.error("Failed to load students");
      } finally {
        setLoading(false);
      }
    };
    void loadStudents();
  }, [open, classId]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="class-students-title">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]">
        <div className="mb-5 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Users size={18} className="shrink-0 text-[#8B6DF2]" /><h2 id="class-students-title" className="truncate text-base font-bold text-slate-900 dark:text-slate-50">{className}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"><X size={18} /></button></div>
        {loading ? <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div> : students.length === 0 ? <div className="py-12 text-center"><Users size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" /><p className="text-sm text-slate-500 dark:text-slate-400">No students enrolled</p></div> : <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10"><table className="w-full min-w-[520px] border-collapse text-left"><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Roll", "Name", "Father", "Phone"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{heading}</th>)}</tr></thead><tbody>{students.map((student) => <tr key={student.id} className="border-t border-slate-100 dark:border-white/5"><td className="px-4 py-3 text-sm font-semibold text-[#8B6DF2]">{student.roll_number || "—"}</td><td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{student.first_name} {student.last_name}</td><td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{student.father_name || "—"}</td><td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{student.phone || "—"}</td></tr>)}</tbody></table></div>}
        <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className={secondaryButtonClass}>Close</button></div>
      </div>
    </div>
  );
}

export default function ClassesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();
  const [classes, setClasses] = useState<ClassType[]>([]);
  const [teachers, setTeachers] = useState<TeacherType[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [role, setRole] = useState<"admin" | "teacher" | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassType | null>(null);
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [assigning, setAssigning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<ClassForm>({ grade_id: "", section: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [studentsClassId, setStudentsClassId] = useState(0);
  const [studentsClassName, setStudentsClassName] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/signin"); return; }
    const fetchData = async () => {
      try {
        const [classesRes, teachersRes, meRes, gradesRes] = await Promise.all([
          api.get("/classes"),
          api.get("/organization/team", { params: { role: "teacher" } }),
          api.get("/auth/me"),
          api.get("/grades"),
        ]);
        const me = meRes.data;
        setRole(me.org_role);
        setTeachers(teachersRes.data);
        setGrades(gradesRes.data);
        const allClasses: ClassType[] = classesRes.data;
        setClasses(me.org_role === "teacher" ? allClasses.filter((classroom) => classroom.teacher_id === me.id) : allClasses);
      } catch {
        toast.error("Failed to load classrooms");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, authLoading, router]);

  const isAdmin = role === "admin";
  const uniqueGrades = Array.from(new Set(classes.map((classroom) => classroom.grade?.name ?? classroom.grade_name).filter(Boolean))) as string[];
  const filtered = classes.filter((classroom) => {
    const matchesSearch = classLabel(classroom).toLowerCase().includes(search.toLowerCase()) || (classroom.teacher_name ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (gradeFilter === "all" || (classroom.grade?.name ?? classroom.grade_name) === gradeFilter);
  });
  const grouped = uniqueGrades.reduce<Record<string, ClassType[]>>((groups, grade) => { groups[grade] = filtered.filter((classroom) => (classroom.grade?.name ?? classroom.grade_name) === grade); return groups; }, {});
  const ungrouped = filtered.filter((classroom) => !(classroom.grade?.name ?? classroom.grade_name));
  const stats = { total: classes.length, grades: uniqueGrades.length, assigned: classes.filter((classroom) => classroom.teacher_name).length, unassigned: classes.filter((classroom) => !classroom.teacher_name).length };

  const openStudents = (classroom: ClassType) => { setStudentsClassId(classroom.id); setStudentsClassName(classLabel(classroom)); setStudentsOpen(true); };
  const openAssign = (classroom: ClassType) => { setSelectedClass(classroom); setTeacherId(classroom.teacher_id ?? ""); setAssignOpen(true); };
  const submitAssign = async () => {
    if (!selectedClass || !teacherId) return;
    setAssigning(true);
    try {
      await api.post(`/classes/${selectedClass.id}/assign-teacher`, { teacher_id: teacherId });
      const teacher = teachers.find((item) => item.id === teacherId);
      setClasses((previous) => previous.map((classroom) => classroom.id === selectedClass.id ? { ...classroom, teacher_id: Number(teacherId), teacher_name: teacher?.full_name ?? null } : classroom));
      toast.success(`Teacher assigned to ${classLabel(selectedClass)}`);
      setAssignOpen(false);
    } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Failed to assign teacher"); } finally { setAssigning(false); }
  };
  const submitAdd = async () => {
    if (!form.grade_id || !form.section.trim()) return;
    setSaving(true);
    try {
      await api.post(`/grades/${form.grade_id}/sections`, { section: form.section });
      toast.success("Classroom created");
      setAddOpen(false);
      setForm({ grade_id: "", section: "" });
      const response = await api.get("/classes");
      setClasses(response.data);
    } catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Failed to create classroom"); } finally { setSaving(false); }
  };
  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await api.delete(`/classes/${deleteId}`); toast.success("Classroom deleted"); setClasses((previous) => previous.filter((classroom) => classroom.id !== deleteId)); setDeleteId(null); }
    catch (error: unknown) { toast.error((error as ApiError).response?.data?.detail ?? "Failed to delete"); } finally { setDeleting(false); }
  };

  const groupedRows = Object.entries(grouped).filter(([, classrooms]) => classrooms.length > 0);
  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">Classes</h1><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{isAdmin ? "Manage classrooms and assign class teachers" : "Your assigned classrooms"}</p></div>{isAdmin && <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"><Plus size={16} />Add Class</button>}</div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">{[
        { label: "Total Classes", value: stats.total, Icon: GraduationCap, tone: "text-[#8B6DF2] bg-[#8B6DF2]/10 border-[#8B6DF2]/20" },
        { label: "Grades", value: stats.grades, Icon: School, tone: "text-blue-600 bg-blue-50 border-blue-400/20 dark:text-blue-400 dark:bg-blue-500/10" },
        { label: "With Teacher", value: stats.assigned, Icon: User, tone: "text-emerald-600 bg-emerald-50 border-emerald-400/20 dark:text-emerald-400 dark:bg-emerald-500/10" },
        { label: "No Teacher", value: stats.unassigned, Icon: Layers, tone: "text-red-500 bg-red-50 border-red-400/20 dark:bg-red-500/10" },
      ].map(({ label, value, Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-center justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tone}`}><Icon size={18} /></span><span className="text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</span></div><p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p></div>)}</div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by class or teacher…" className={`${inputClass} pl-9`} /></div><select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className={`${inputClass} sm:w-48`}><option value="all">All Grades</option>{uniqueGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></div>

      {loading || authLoading ? <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div> : filtered.length === 0 ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10"><GraduationCap size={32} className="mb-3 text-slate-300 dark:text-slate-600" /><p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{search ? "No classrooms match your search" : "No classrooms found"}</p>{isAdmin && <button type="button" onClick={() => setAddOpen(true)} className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">Add a classroom</button>}</div> : <>
        <div className="space-y-6 sm:hidden">{groupedRows.map(([grade, classrooms]) => <section key={grade}><div className="mb-2 flex items-center gap-2"><School size={14} className="text-[#8B6DF2]" /><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{grade}</h2></div><div className="grid gap-3">{classrooms.map((classroom) => <ClassCard key={classroom.id} classroom={classroom} isAdmin={isAdmin} onAssign={() => openAssign(classroom)} onDelete={() => setDeleteId(classroom.id)} onViewStudents={() => openStudents(classroom)} />)}</div></section>)}{ungrouped.map((classroom) => <ClassCard key={classroom.id} classroom={classroom} isAdmin={isAdmin} onAssign={() => openAssign(classroom)} onDelete={() => setDeleteId(classroom.id)} onViewStudents={() => openStudents(classroom)} />)}</div>
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 sm:block"><table className="w-full min-w-[900px] border-collapse text-left"><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Class", "Grade", "Section", "Class Teacher", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{heading}</th>)}</tr></thead><tbody>{groupedRows.map(([grade, classrooms]) => <Fragment key={grade}><tr className="border-t border-slate-100 bg-slate-50/60 dark:border-white/5 dark:bg-white/[0.02]"><td colSpan={6} className="px-4 py-2"><span className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400"><School size={13} className="text-[#8B6DF2]" />{grade}<span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] dark:bg-white/10 dark:text-slate-300">{classrooms.length} section{classrooms.length === 1 ? "" : "s"}</span></span></td></tr>{classrooms.map((classroom) => <tr key={classroom.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100"><span className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><GraduationCap size={15} className="text-[#8B6DF2]" /></span>{classLabel(classroom)}</span></td><td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{classroom.grade?.name ?? classroom.grade_name ?? "—"}</td><td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300"><span className="rounded-md border border-blue-400/25 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400">Section {classroom.section}</span></td><td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{classroom.teacher_name || <span className="italic text-slate-400 dark:text-slate-500">Not assigned</span>}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-xs font-semibold ${classroom.teacher_name ? "border border-emerald-400/25 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" : "border border-red-400/25 bg-red-50 text-red-500 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400"}`}>{classroom.teacher_name ? "Assigned" : "Unassigned"}</span></td><td className="px-4 py-3"><div className="flex gap-1"><button type="button" title="View students" onClick={() => openStudents(classroom)} className={`${actionButtonClass} hover:bg-blue-500/10 hover:text-blue-500`}><Users size={16} /></button>{isAdmin && <><button type="button" title={classroom.teacher_name ? "Reassign teacher" : "Assign teacher"} onClick={() => openAssign(classroom)} className={`${actionButtonClass} hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2]`}><UserPlus size={16} /></button><button type="button" title="Delete classroom" onClick={() => setDeleteId(classroom.id)} className={`${actionButtonClass} hover:bg-red-500/10 hover:text-red-500`}><Trash2 size={16} /></button></>}</div></td></tr>)}</Fragment>)}</tbody></table></div>
      </>}

      {assignOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="assign-teacher-title"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]"><div className="mb-5 flex items-center justify-between"><h2 id="assign-teacher-title" className="text-base font-bold text-slate-900 dark:text-slate-50">{selectedClass?.teacher_name ? "Reassign Teacher" : "Assign Teacher"}</h2><button type="button" onClick={() => setAssignOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><X size={18} /></button></div><div className="mb-4 rounded-lg border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8B6DF2]">Assigning to</p><p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedClass && classLabel(selectedClass)}</p></div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Teacher <span className="text-red-500">*</span><select value={teacherId} onChange={(event) => setTeacherId(Number(event.target.value))} className={`${inputClass} mt-1.5`}><option value="" disabled>Select teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name} · {teacher.email}</option>)}</select></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setAssignOpen(false)} disabled={assigning} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={submitAssign} disabled={assigning || !teacherId} className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40">{assigning ? "Assigning…" : "Save"}</button></div></div></div>}
      {addOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="add-class-title"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]"><div className="mb-5 flex items-center justify-between"><h2 id="add-class-title" className="text-base font-bold text-slate-900 dark:text-slate-50">Add Classroom</h2><button type="button" onClick={() => setAddOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><X size={18} /></button></div><div className="space-y-4"><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Grade <span className="text-red-500">*</span><select value={form.grade_id} onChange={(event) => setForm({ ...form, grade_id: Number(event.target.value) })} className={`${inputClass} mt-1.5`}><option value="" disabled>Select grade</option>{grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Section <span className="text-red-500">*</span><input value={form.section} maxLength={5} onChange={(event) => setForm({ ...form, section: event.target.value.toUpperCase() })} placeholder="e.g. A, B, C" className={`${inputClass} mt-1.5`} /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setAddOpen(false)} disabled={saving} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={submitAdd} disabled={saving || !form.grade_id || !form.section.trim()} className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Creating…" : "Save Classroom"}</button></div></div></div>}
      {deleteId !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-class-title"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]"><h2 id="delete-class-title" className="text-base font-bold text-slate-900 dark:text-slate-50">Delete classroom?</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">This will permanently delete the classroom and may affect enrolled students.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDeleteId(null)} disabled={deleting} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40">{deleting ? "Deleting…" : "Delete"}</button></div></div></div>}
      <StudentsDialog open={studentsOpen} onClose={() => setStudentsOpen(false)} classId={studentsClassId} className={studentsClassName} />
    </div>
  );
}

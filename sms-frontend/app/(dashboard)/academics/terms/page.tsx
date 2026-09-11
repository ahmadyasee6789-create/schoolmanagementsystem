"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Search } from "lucide-react";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import { useAuthStore } from "@/app/store/authStore";
import TermCard from "@/components/academics/term/TermCard";
import TermsTable from "@/components/academics/term/TermsTable";
import AddEditTermDialog from "@/components/academics/term/AddEditDialog";
import DeleteTermDialog from "@/components/academics/term/DeleteTermDialog";

type AcademicSession = { id: number; name: string; is_active: boolean };
type Term = {
  id: number;
  name: string;
  academic_year_id: number;
  academic_year?: { id: number; name: string };
  exams?: any[];
};

export default function TermsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [terms, setTerms] = useState<Term[]>([]);
  const [activeSession, setActiveSession] = useState<AcademicSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [termName, setTermName] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchActiveSession = async () => {
    try {
      const res = await api.get("/sessions/active");
      setActiveSession(res.data);
    } catch {
      setActiveSession(null);
    }
  };

  const fetchTerms = async () => {
    try {
      const res = await api.get("/terms");
      setTerms(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      if (e?.response?.status !== 400) toast.error("Failed to load terms");
      setTerms([]);
    }
  };
 
  
  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchActiveSession(), fetchTerms()]);
    setLoading(false);
  };
  
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/signin");
      return;
    }
    fetchAll();
  }, [user, authLoading]);
  
  const filtered = terms.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
);

const grouped = filtered.reduce<Record<string, { sessionName: string; terms: Term[] }>>(
  (acc, t) => {
    const key = String(t.academic_year_id);
    if (!acc[key]) {
      acc[key] = {
        sessionName: t.academic_year?.name ?? `Session #${t.academic_year_id}`,
        terms: [],
      };
    }
    acc[key].terms.push(t);
    return acc;
  },
  {}
);

  const openAdd = () => {
    setTermName("");
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (t: Term) => {
    setTermName(t.name);
    setEditingId(t.id);
    setDialogOpen(true);
  };

  const saveTerm = async () => {
    if (!termName.trim()) return;
    setSaving(true);
    try {
      editingId
        ? await api.put(`/terms/${editingId}`, { name: termName })
        : await api.post("/terms", { name: termName });
      toast.success(editingId ? "Term updated" : "Term created");
      setDialogOpen(false);
      fetchTerms();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/terms/${deleteId}`);
      toast.success("Term deleted");
      setDeleteId(null);
      fetchTerms();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const noActiveSession = !activeSession;

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#111827] sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">
            Terms
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {activeSession
              ? `Active session: ${activeSession.name}`
              : "No active session — activate one to manage terms"}
          </p>
        </div>
        <button
          onClick={openAdd}
          disabled={noActiveSession}
          title={noActiveSession ? "Activate an academic session first" : undefined}
          className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#8B6DF2]"
        >
          <Plus size={16} />
          Add Term
        </button>
      </div>

      {/* No active session warning */}
      {!loading && noActiveSession && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              No active academic session
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/70">
              Terms can only be created within an active session.
            </p>
          </div>
          <button
            onClick={() => router.push("/organization/sessions")}
            className="whitespace-nowrap rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-500/10"
          >
            Go to Academic Years
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search terms…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      {/* Content */}
      {loading || authLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10">
          <BookOpen size={32} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {search ? "No terms match your search" : "No terms yet for this session"}
          </p>
          <button
            onClick={openAdd}
            disabled={noActiveSession}
            className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add your first term
          </button>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="sm:hidden">
            {filtered.map((term) => (
              <TermCard
                key={term.id}
                term={term}
                onEdit={() => openEdit(term)}
                onDelete={() => setDeleteId(term.id)}
              />
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden sm:block">
            <TermsTable
              grouped={grouped}
              onEdit={openEdit}
              onDelete={(id) => setDeleteId(id)}
            />
          </div>
        </>
      )}

      <AddEditTermDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={!!editingId}
        activeSessionName={activeSession?.name}
        termName={termName}
        setTermName={setTermName}
        onSave={saveTerm}
        saving={saving}
      />

      <DeleteTermDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { Calendar, Plus } from "lucide-react";
import { api } from "@/app/lib/api";
import toast from "react-hot-toast";
import SessionCard from "@/components/academics/SessionCard";
import SessionsTable from "@/components/academics/SessionTable";
import AddSessionDialog from "@/components/academics/AddSessionDialog";

interface Session {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export default function AcademicSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);

  const fetchSessions = async () => {
    try {
      const res = await api.get("/sessions");
      setSessions(res.data);
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      toast.error("Please fill in all fields");
      return;
    }
    setSaving(true);
    try {
      await api.post("/sessions", { ...form, is_active: false });
      toast.success("Session created");
      setOpen(false);
      setForm({ name: "", start_date: "", end_date: "" });
      fetchSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Error creating session");
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (id: number) => {
    try {
      const res = await api.put(`/sessions/${id}/activate`);
      toast.success(`Session "${res.data.name}" activated`);
      fetchSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to activate session");
    }
  };

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#111827] sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">
            Academic Sessions
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Manage school years and set the active academic session
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
        >
          <Plus size={16} />
          Add Session
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-amber-400/20 border-t-amber-500" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10">
          <Calendar size={32} className="mb-3 text-slate-300 dark:text-slate-600" />
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">No academic sessions found</p>
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white "
          >
            Add Session
          </button>
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="sm:hidden">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} onActivate={() => handleSetActive(s.id)} />
            ))}
          </div>
          {/* Desktop */}
          <div className="hidden sm:block">
            <SessionsTable sessions={sessions} onActivate={handleSetActive} />
          </div>
        </>
      )}

      <AddSessionDialog
        open={open}
        onClose={() => setOpen(false)}
        form={form}
        setForm={setForm}
        onSave={handleCreate}
        saving={saving}
      />
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, GraduationCap, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DashboardLayout from "@/app/(dashboard)/layout";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import { EmptyState, LoadingState, Modal, PageHeader, StatGrid, secondaryButtonClass } from "@/components/exams/ExamUi";
import { Badge, DataTable, errorMessage, InitialsAvatar, tableCellClass, tableHeadClass } from "@/components/finance/FinanceUi";

type Member = { id: number; full_name: string; email: string; role: "admin" | "manager" | "teacher" | "accountant" };
type RoleTone = "purple" | "blue" | "green" | "red";
const roleInfo: Record<Member["role"], { label: string; tone: RoleTone }> = {
  admin: { label: "Admin", tone: "red" }, manager: { label: "Manager", tone: "blue" }, teacher: { label: "Teacher", tone: "green" }, accountant: { label: "Accountant", tone: "purple" },
};

function RoleBadge({ role }: { role: Member["role"] }) {
  const info = roleInfo[role] ?? roleInfo.teacher;
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

function MemberCard({ member, onDelete }: { member: Member; onDelete: () => void }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><InitialsAvatar name={member.full_name} /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{member.full_name}</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">{member.email}</p></div></div><button type="button" title="Remove member" onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"><Trash2 size={16} /></button></div><div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/5"><RoleBadge role={member.role} /></div></article>;
}

export default function OrganizationTeamPage() {
  const router = useRouter();
  const { user, hydrated, token } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !token) {
      setError("Unauthorized. Redirecting…");
      const timeout = window.setTimeout(() => router.replace("/signin"), 1500);
      return () => window.clearTimeout(timeout);
    }
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        const response = await api.get("/organization/team");
        if (!active) return;
        setMembers(response.data ?? []);
        setError(null);
      } catch (requestError: unknown) {
        if (!active) return;
        const status = (requestError as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          setError("Session expired. Redirecting to login…");
          window.setTimeout(() => router.replace("/signin"), 2000);
        } else if (status === 403) {
          setError("Access denied.");
          window.setTimeout(() => router.replace("/"), 2000);
        } else setError(errorMessage(requestError, "Failed to load team members"));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [hydrated, router, token, user]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/organization/team/${deleteId}`);
      setMembers((previous) => previous.filter((member) => member.id !== deleteId));
      setDeleteId(null);
      toast.success("Team member removed");
    } catch (requestError: unknown) { toast.error(errorMessage(requestError, "Failed to remove member")); }
    finally { setDeleting(false); }
  };

  const stats = { total: members.length, admins: members.filter((member) => member.role === "admin").length, teachers: members.filter((member) => member.role === "teacher").length, managers: members.filter((member) => member.role === "manager").length };
  return <DashboardLayout><div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8"><PageHeader title="Team Members" subtitle="Manage staff roles and access across your organization" />
    {!loading && !error && <StatGrid stats={[{ label: "Total Members", value: stats.total, Icon: UsersRound, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" }, { label: "Admins", value: stats.admins, Icon: ShieldCheck, tone: "border-red-400/20 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400" }, { label: "Teachers", value: stats.teachers, Icon: GraduationCap, tone: "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" }, { label: "Managers", value: stats.managers, Icon: BriefcaseBusiness, tone: "border-blue-400/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400" }]} />}
    {error ? <div className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400"><AlertTriangle size={18} className="mt-0.5 shrink-0" />{error}</div> : loading ? <LoadingState /> : members.length === 0 ? <EmptyState icon={UsersRound} message="No team members found" /> : <><div className="grid gap-3 sm:hidden">{members.map((member) => <MemberCard key={member.id} member={member} onDelete={() => setDeleteId(member.id)} />)}</div><DataTable><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Member", "Email", "Role", "Actions"].map((heading) => <th key={heading} className={tableHeadClass}>{heading}</th>)}</tr></thead><tbody>{members.map((member) => <tr key={member.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className={tableCellClass}><span className="flex items-center gap-2"><InitialsAvatar name={member.full_name} /><span className="font-semibold text-slate-900 dark:text-slate-100">{member.full_name}</span></span></td><td className={`${tableCellClass} text-xs text-slate-500 dark:text-slate-400`}>{member.email}</td><td className={tableCellClass}><RoleBadge role={member.role} /></td><td className={tableCellClass}><button type="button" title="Remove member" onClick={() => setDeleteId(member.id)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"><Trash2 size={16} /></button></td></tr>)}</tbody></DataTable></>}
    {deleteId !== null && <Modal title="Remove Team Member?" onClose={() => !deleting && setDeleteId(null)}><div className="space-y-5"><p className="text-sm text-slate-600 dark:text-slate-300">This will remove the member from your organization. They will lose access immediately.</p><div className="flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => setDeleteId(null)} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">{deleting ? "Removing…" : "Remove Member"}</button></div></div></Modal>}
  </div></DashboardLayout>;
}

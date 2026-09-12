"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, Mail, Send, Trash2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import DashboardLayout from "@/app/(dashboard)/layout";
import { getInvitations, sendInvitation, deleteInvitation } from "@/app/lib/invitations";
import { useAuthStore } from "@/app/store/authStore";
import { EmptyState, LoadingState, Modal, PageHeader, StatGrid, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";
import { Badge, DataTable, errorMessage, tableCellClass, tableHeadClass } from "@/components/finance/FinanceUi";

type Invitation = { id: number; email: string; role: string; status: "pending" | "accepted"; token?: string };
type Tone = "purple" | "blue" | "green" | "red";
const roles = ["admin", "teacher", "accountant"];
const roleTone = (role: string): Tone => ({ admin: "red", teacher: "green", accountant: "blue" }[role] ?? "purple") as Tone;
const formatRole = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

function RoleBadge({ role }: { role: string }) { return <Badge tone={roleTone(role)}>{formatRole(role)}</Badge>; }
function StatusBadge({ status }: { status: Invitation["status"] }) { return status === "accepted" ? <Badge tone="green"><CheckCircle2 size={13} />Accepted</Badge> : <Badge tone="purple"><Clock3 size={13} />Pending</Badge>; }

function InviteCard({ invitation, onCopy, onDelete }: { invitation: Invitation; onCopy: () => void; onDelete: () => void }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#8B6DF2]/20 bg-[#8B6DF2]/10"><Mail size={17} className="text-[#8B6DF2]" /></span><p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{invitation.email}</p></div><div className="flex shrink-0 gap-1">{invitation.status === "pending" && <button type="button" title="Copy invite link" onClick={onCopy} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Copy size={16} /></button>}<button type="button" title="Delete invitation" onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"><Trash2 size={16} /></button></div></div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-white/5"><RoleBadge role={invitation.role} /><StatusBadge status={invitation.status} /></div></article>;
}

export default function InvitationsPage() {
  const { user } = useAuthStore();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("teacher");
  const [sending, setSending] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadInvitations = async () => {
    try { setInvitations(await getInvitations()); }
    catch (requestError: unknown) { toast.error(errorMessage(requestError, "Failed to fetch invitations")); }
    finally { setLoadingInvites(false); }
  };
  useEffect(() => { void loadInvitations(); }, []);

  const handleInvite = async () => {
    if (!email) return toast.error("Please enter an email address");
    if (!email.includes("@")) return toast.error("Please enter a valid email address");
    setSending(true);
    try {
      await sendInvitation({ email, role });
      await loadInvitations();
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
    } catch (requestError: unknown) { toast.error(errorMessage(requestError, "Failed to send invitation")); }
    finally { setSending(false); }
  };
  const copyInviteLink = (token?: string) => {
    if (!token) return toast.error("No invite token available");
    const link = `${window.location.origin}/signup?invite=${token}`;
    void navigator.clipboard.writeText(link).then(() => toast.success("Invite link copied to clipboard!")).catch(() => toast.error("Failed to copy invite link"));
  };
  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteInvitation(deleteId);
      setInvitations((previous) => previous.filter((invitation) => invitation.id !== deleteId));
      setDeleteId(null);
      toast.success("Invitation deleted");
    } catch (requestError: unknown) { toast.error(errorMessage(requestError, "Failed to delete invitation")); }
    finally { setDeleting(false); }
  };

  const pending = invitations.filter((invitation) => invitation.status === "pending").length;
  const accepted = invitations.filter((invitation) => invitation.status === "accepted").length;
  if (!user) return null;

  return <DashboardLayout><div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8"><PageHeader title="Invitations" subtitle="Invite team members to join your organization" />
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="mb-3 flex items-center gap-2"><Send size={15} className="text-[#8B6DF2]" /><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Send Invitation</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12"><div className="relative lg:col-span-5"><Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void handleInvite()} placeholder="user@example.com" className={`${inputClass} pl-9`} /></div><select value={role} onChange={(event) => setRole(event.target.value)} className={`${inputClass} lg:col-span-3`} aria-label="Invitation role">{roles.map((currentRole) => <option key={currentRole} value={currentRole}>{formatRole(currentRole)}</option>)}</select><button type="button" disabled={sending || !email} onClick={() => void handleInvite()} className={`${primaryButtonClass} inline-flex items-center justify-center gap-2 lg:col-span-4`}><Send size={16} />{sending ? "Sending…" : "Send Invite"}</button></div></section>
    {!loadingInvites && invitations.length > 0 && <StatGrid stats={[{ label: "Total Invitations", value: invitations.length, Icon: UserPlus, tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]" }, { label: "Pending", value: pending, Icon: Clock3, tone: "border-amber-400/20 bg-amber-50 text-amber-600 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-400" }, { label: "Accepted", value: accepted, Icon: CheckCircle2, tone: "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400" }]} />}
    {loadingInvites ? <LoadingState /> : invitations.length === 0 ? <EmptyState icon={UserPlus} message="No invitations found. Send one above to get started." /> : <><div className="grid gap-3 sm:hidden">{invitations.map((invitation) => <InviteCard key={invitation.id} invitation={invitation} onCopy={() => copyInviteLink(invitation.token)} onDelete={() => setDeleteId(invitation.id)} />)}</div><DataTable><thead className="bg-slate-50 dark:bg-white/[0.03]"><tr>{["Email", "Role", "Status", "Actions"].map((heading) => <th key={heading} className={tableHeadClass}>{heading}</th>)}</tr></thead><tbody>{invitations.map((invitation) => <tr key={invitation.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"><td className={`${tableCellClass} font-medium text-slate-900 dark:text-slate-100`}><span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#8B6DF2]/10"><Mail size={15} className="text-[#8B6DF2]" /></span>{invitation.email}</span></td><td className={tableCellClass}><RoleBadge role={invitation.role} /></td><td className={tableCellClass}><StatusBadge status={invitation.status} /></td><td className={tableCellClass}><span className="flex gap-1">{invitation.status === "pending" && <button type="button" title="Copy invite link" onClick={() => copyInviteLink(invitation.token)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#8B6DF2]/10 hover:text-[#8B6DF2] dark:text-slate-500"><Copy size={16} /></button>}<button type="button" title="Delete invitation" onClick={() => setDeleteId(invitation.id)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"><Trash2 size={16} /></button></span></td></tr>)}</tbody></DataTable></>}
    {deleteId !== null && <Modal title="Delete Invitation?" onClose={() => !deleting && setDeleteId(null)}><div className="space-y-5"><p className="text-sm text-slate-600 dark:text-slate-300">This will permanently revoke the invitation. The invite link will no longer work.</p><div className="flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => setDeleteId(null)} className={secondaryButtonClass}>Cancel</button><button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">{deleting ? "Deleting…" : "Delete Invitation"}</button></div></div></Modal>}
  </div></DashboardLayout>;
}

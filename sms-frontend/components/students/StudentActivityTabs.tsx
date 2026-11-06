"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarCheck, FileText, Printer, Wallet, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { openFeeReceipt } from "@/app/lib/feeReceipt";
import { useStudentResults } from "@/app/hooks/useStudents";
import { studentApiError } from "@/app/lib/studentApi";
import { EmptyState } from "@/components/exams/ExamUi";
import StudentResultsList from "@/components/exams/StudentResultsList";
import { Badge, Money, panelClass } from "@/components/finance/FinanceUi";
import MultiFeeCollectionDialog from "@/components/finance/MultiFeeCollectionDialog";
import { secondaryButtonClass } from "./types";
import { StudentError, StudentSkeleton } from "./StudentDetailStates";

function StudentModuleLink({ title, description, icon: Icon, href, action }: { title: string; description: string; icon: LucideIcon; href: string; action: string }) {
  return <section className={`${panelClass} flex flex-col items-start p-5 sm:p-6`}>
    <span className="mb-4 rounded-lg bg-[#8B6DF2]/10 p-2.5 text-[#8B6DF2]"><Icon size={22} /></span>
    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    <Link href={href} className={`${secondaryButtonClass} mt-5 inline-flex items-center gap-2`}>{action}<ArrowUpRight size={15} /></Link>
  </section>;
}

type Fee = { fee_id: number; billing_period: string; final_amount: string; paid_amount: string; outstanding: string; yearly_discount_amount?: string; status: "paid" | "partial" | "unpaid"; future: boolean; overdue: boolean; payment_date?: string };
type Payment = { transaction_id: number; receipt_no: string; payment_date: string; amount: string; available_credit: string; status: string; allocations: { billing_period: string; amount: string }[] };
type History = { items: Fee[]; sessions: { session_id: number; session_name: string; billed: string; paid: string; outstanding: string; available_credit: string }[] };

export function StudentFeesTab({ studentId, studentName, className, refreshKey = 0 }: { studentId: number; studentName?: string; className?: string; refreshKey?: number }) {
  const [history, setHistory] = useState<History | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setLoading(true);
    setError(null);
    try {
      const params = sessionId ? { session_id: sessionId, limit: 100 } : { limit: 100 };
      const [historyResponse, paymentResponse] = await Promise.all([
        api.get<History>(`/fees/students/${studentId}/history`, { params, signal }),
        api.get<{ items: Payment[] }>(`/fees/students/${studentId}/payments`, { params: { ...params, limit: 50 }, signal }),
      ]);
      if (signal.aborted) return;
      setHistory(historyResponse.data);
      setPayments(paymentResponse.data.items ?? []);
    } catch (cause) {
      if (!signal.aborted) setError(studentApiError(cause, "Unable to load student fee history.").message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [studentId, sessionId]);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load, refreshKey]);
  if (loading && !history) return <StudentSkeleton />;
  const summaries = history?.sessions.filter((session) => !sessionId || String(session.session_id) === sessionId) ?? [];
  const status = (fee: Fee) => fee.status === "paid" ? "Paid" : fee.future ? "Future" : fee.overdue ? "Overdue" : fee.status === "partial" ? "Partial" : "Unpaid";
  const tone = (name: string) => name === "Paid" ? "green" : name === "Partial" || name === "Future" ? "blue" : name === "Overdue" ? "red" : "red";
  return <section className="space-y-4" aria-label="Student fee history">
    {error && <StudentError message={error} retry={() => void load()} />}
    <div className={error ? "hidden" : "space-y-4"}>
    <div className={`${panelClass} flex flex-wrap items-end justify-between gap-3 p-4`}><div><h2 className="font-bold text-slate-900 dark:text-slate-100">Fee history</h2><p className="mt-1 text-sm text-slate-500">Monthly obligations, payments, and available advance credit.</p></div><div className="flex gap-2"><select value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#0D1117]"><option value="">All sessions</option>{history?.sessions.map((session) => <option key={session.session_id} value={session.session_id}>{session.session_name}</option>)}</select><button type="button" onClick={() => setCollecting(true)} className={`${secondaryButtonClass} inline-flex items-center gap-2`}><Wallet size={15} />Collect</button></div></div>
    {summaries.map((current) => <section key={current.session_id} aria-label={current.session_name}>
      {!sessionId && <h3 className="mb-2 text-sm font-semibold">{current.session_name}</h3>}
      <div className="grid gap-3 sm:grid-cols-4"><div className={`${panelClass} p-3 text-sm`}>Billed <Money fractionDigits={2} value={Number(current.billed)} className="mt-1 block" /></div><div className={`${panelClass} p-3 text-sm`}>Paid <Money fractionDigits={2} value={Number(current.paid)} className="mt-1 block text-emerald-600" /></div><div className={`${panelClass} p-3 text-sm`}>Outstanding <Money fractionDigits={2} value={Number(current.outstanding)} className="mt-1 block text-red-600" /></div><div className={`${panelClass} p-3 text-sm`}>Advance credit <Money fractionDigits={2} value={Number(current.available_credit)} className="mt-1 block text-blue-600" /></div></div>
    </section>)}
    <div className={`${panelClass} overflow-x-auto p-4`}><h3 className="mb-3 text-sm font-bold">Monthly fee history</h3>{history?.items.length ? <table className="w-full min-w-[620px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th>Period</th><th>Final</th><th>Yearly discount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{history.items.map((fee) => { const label = status(fee); return <tr key={fee.fee_id} className="border-t border-slate-100 dark:border-white/10"><td className="py-3">{fee.billing_period}</td><td><Money fractionDigits={2} value={Number(fee.final_amount)} /></td><td><Money fractionDigits={2} value={Number(fee.yearly_discount_amount ?? 0)} /></td><td><Money fractionDigits={2} value={Number(fee.paid_amount)} /></td><td><Money fractionDigits={2} value={Number(fee.outstanding)} /></td><td><Badge tone={tone(label)}>{label}</Badge></td></tr>; })}</tbody></table> : <p className="text-sm text-slate-500">No fee obligations for this selection.</p>}</div>
    <div className={`${panelClass} p-4`}><h3 className="mb-3 text-sm font-bold">Payments and receipts</h3>{payments.length ? <div className="space-y-3">{payments.map((payment) => <div key={payment.transaction_id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm first:border-0 first:pt-0 dark:border-white/10"><div><p className="font-semibold">{payment.receipt_no} · <Money fractionDigits={2} value={Number(payment.amount)} /></p><p className="text-xs text-slate-500">{payment.payment_date} · {payment.allocations.map((allocation) => `${allocation.billing_period} (${allocation.amount})`).join(", ") || "Advance credit"}{Number(payment.available_credit) > 0 ? ` · Credit ${payment.available_credit}` : ""}</p></div><button type="button" className={secondaryButtonClass} onClick={() => void openFeeReceipt(payment.transaction_id).catch(() => toast.error("Unable to open receipt. Allow pop-ups and try again."))}><Printer size={14} /> Print receipt</button></div>)}</div> : <p className="text-sm text-slate-500">No payments recorded.</p>}</div>
    {collecting && <MultiFeeCollectionDialog studentId={studentId} studentName={studentName} className={className} initialSessionId={sessionId ? Number(sessionId) : undefined} onClose={() => setCollecting(false)} onSuccess={load} />}
    </div>
  </section>;
}

export function StudentAttendanceTab() {
  return <StudentModuleLink title="Student attendance history" icon={CalendarCheck} description="Individual attendance history is not available in this profile yet. Open Attendance to view or mark attendance for a class and date." href="/students/attendances" action="Open Attendance" />;
}

export function StudentResultsTab({ studentId }: { studentId: number }) {
  const query = useStudentResults(studentId);
  if (query.isPending) return <StudentSkeleton />;
  if (query.isError) return <StudentError message={studentApiError(query.error, "Unable to load exam results. Please try again.").message} retry={() => void query.refetch()} />;
  if (!query.data.results.length) return <EmptyState icon={FileText} message="No exam results recorded for this student’s active enrollment." />;
  return <section aria-label="Student exam results" className="space-y-4">
    <p className="text-sm text-slate-500 dark:text-slate-400">Exam results for the current academic session.</p>
    <StudentResultsList results={query.data.results} papers={query.data.papers} />
  </section>;
}

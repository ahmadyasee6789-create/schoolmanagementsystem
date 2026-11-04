"use client";

import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { billingPeriods, collectionMoney, staleCollectionPreview, type PeriodType } from "@/app/lib/feeCollection";
import { openFeeReceipt } from "@/app/lib/feeReceipt";
import { Modal, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/exams/ExamUi";
import { LabeledField, Money } from "@/components/finance/FinanceUi";

type Session = { id: number; name: string; start_date: string; end_date?: string };
type FeeLine = { billing_period: string; monthly_fee: string; admission_fee: string; exam_fee: string; discount_amount: string; yearly_discount_amount?: string; yearly_discount_percent?: string; paid_amount: string; outstanding: string; status: string };
type Preview = { student_name: string; session_name: string; obligations: FeeLine[]; previous_dues: FeeLine[]; available_credit: string; total_payable: string; cash_received: string; credit_used: string; remaining_due: string; new_advance_credit: string; remaining_advance_credit: string; preview_id: string };
type Pending = { key: string; body: Record<string, unknown> };

const toPeriod = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
function errorDetail(error: unknown, fallback: string) { return isAxiosError(error) && typeof error.response?.data?.detail === "string" ? error.response.data.detail : fallback; }

function readPending(key: string, studentId: number): Pending | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  const pending = JSON.parse(raw) as Pending | null;
  if (!pending || !/^[A-Za-z0-9_.:-]{8,128}$/.test(pending.key) || pending.body?.student_id !== studentId
    || typeof pending.body.preview_id !== "string" || !/^[a-f0-9]{64}$/.test(pending.body.preview_id)) {
    throw new Error("Invalid pending collection");
  }
  return pending;
}

export default function MultiFeeCollectionDialog({ studentId, studentName, className, initialSessionId, onClose, onSuccess }: {
  studentId: number; studentName?: string; className?: string; initialSessionId?: number;
  onClose: () => void; onSuccess?: () => void | Promise<void>;
}) {
  const storageKey = `pending-multi-fee-payment:${studentId}`;
  const inFlight = useRef(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [start, setStart] = useState(toPeriod(new Date()));
  const [customMonths, setCustomMonths] = useState(toPeriod(new Date()));
  const [amount, setAmount] = useState("");
  const [creditAmount, setCreditAmount] = useState("0.00");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [retainCredit, setRetainCredit] = useState(false);
  const [includeAdmission, setIncludeAdmission] = useState(false);
  const [includeExam, setIncludeExam] = useState(false);
  const [yearlyDiscountPercent, setYearlyDiscountPercent] = useState("0");
  const [review, setReview] = useState<{ preview: Preview; body: Record<string, unknown>; quoteOnly: boolean } | null>(null);
  const preview = review?.preview;
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ transaction_id: number | null } | null>(null);
  const [pending, setPending] = useState<Pending | "unavailable" | null>(() => {
    try { return readPending(storageKey, studentId); }
    catch { return "unavailable"; }
  });

  useEffect(() => {
    void api.get<(Session & { is_active?: boolean })[]>("/sessions").then(({ data }) => {
      setSessions(data);
      const selected = data.find((row) => row.id === initialSessionId) ?? data.find((row) => row.is_active) ?? data[0];
      if (selected) setSessionId(String(selected.id));
    }).catch(() => toast.error("Unable to load academic sessions"));
  }, [initialSessionId]);
  const selectedPeriods = billingPeriods(periodType, start, customMonths.split(",").map((month) => month.trim()));
  const periods = selectedPeriods ?? [];
  const cash = collectionMoney(amount);
  const credit = periodType === "advance_only" ? "0.00" : collectionMoney(creditAmount);
  const discount = periodType === "yearly" ? collectionMoney(yearlyDiscountPercent) : "0.00";
  const quoteOnly = Number(cash) === 0 && Number(credit) === 0 && Number(discount) > 0;

  const requestPreview = async () => {
    if (!sessionId || !selectedPeriods || cash === null || credit === null || discount === null || Number(discount) > 100) {
      return toast.error("Select a session, valid unique months, and amounts with at most two decimal places.");
    }
    if (periodType === "advance_only" ? Number(cash) <= 0 || !retainCredit : !quoteOnly && Number(cash) + Number(credit) === 0) {
      return toast.error(periodType === "advance_only" ? "Enter a positive advance and confirm it will remain credit." : "Enter an amount or existing credit.");
    }
    const body = {
      student_id: studentId, session_id: Number(sessionId), period_type: periodType, billing_periods: periods,
      admission_period: includeAdmission ? periods[0] ?? null : null, exam_periods: includeExam ? periods : [],
      amount: cash, credit_amount: credit, retain_excess_as_credit: retainCredit,
      payment_method: Number(cash) > 0 ? paymentMethod : null,
      ...(Number(discount) > 0 ? { yearly_discount_percent: discount } : {}),
    };
    setLoading(true);
    try {
      const response = await api.post<Preview>("/fees/collection/preview", body);
      setReview({ preview: response.data, body: { ...body, preview_id: response.data.preview_id }, quoteOnly });
    } catch (error) {
      setReview(null);
      toast.error(errorDetail(error, "Fee preview could not be calculated."));
    }
    finally { setLoading(false); }
  };
  const confirm = async (retry = false) => {
    if (inFlight.current) return;
    let saved: Pending | null;
    try { saved = readPending(storageKey, studentId); }
    catch { return toast.error("The saved payment needs review before retrying."); }
    if (!saved && (retry || !review || review.quoteOnly)) return toast.error("Preview the exact collection before confirming it.");
    const attempt = saved ?? { key: crypto.randomUUID(), body: review!.body };
    if (!saved) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)); }
      catch { return toast.error("This browser cannot safely preserve the payment retry."); }
    }
    setPending(attempt);
    inFlight.current = true; setSubmitting(true);
    try {
      const { data } = await api.post<{ transaction_id: number | null }>("/fees/collection/multi", attempt.body, {
        headers: { "Idempotency-Key": attempt.key }, timeout: 30000,
      });
      setResult(data);
      sessionStorage.removeItem(storageKey);
      setPending(null);
    } catch (error) {
      const response = isAxiosError(error) ? error.response : undefined;
      const stale = staleCollectionPreview(response?.status, response?.data?.detail);
      if (stale || (!saved && [400, 401, 403, 404, 422].includes(response?.status ?? 0))) {
        sessionStorage.removeItem(storageKey);
        setPending(null);
        setReview(null);
        toast.error(errorDetail(error, "Payment was rejected. Review a fresh preview before confirming again."));
      } else {
        toast.error(errorDetail(error, "Confirmation is uncertain. Retry the original request."));
      }
      return;
    } finally { inFlight.current = false; setSubmitting(false); }
    try { await onSuccess?.(); }
    catch { toast.error("Collection was confirmed. Refresh fee history to see the latest balances."); }
  };
  if (result) {
    const receiptId = result.transaction_id;
    return <Modal title={receiptId ? "Payment successful" : "Advance credit applied"} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">The backend confirmed this collection.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Close</button>
          {receiptId && <button type="button" className={primaryButtonClass} onClick={() => void openFeeReceipt(receiptId).catch(() => toast.error("Unable to open receipt. Allow pop-ups and try again."))}>Print receipt</button>}
        </div>
      </div>
    </Modal>;
  }
  return <Modal title="Collect fee payment" size="md" busy={submitting} onClose={onClose}><div className="space-y-4"><div className="rounded-xl bg-[#8B6DF2]/10 p-3 text-sm"><strong>{studentName ?? "Student"}</strong>{className ? <span className="text-slate-500"> · {className}</span> : null}</div>
    {pending && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      {pending === "unavailable" ? "This browser could not read the saved collection. Review the payment before starting a new one." : "A confirmation is pending. Retry the original collection."}
    </div>}
    <fieldset disabled={loading || submitting || pending !== null} className="min-w-0 space-y-4">
    <div className="grid gap-3 sm:grid-cols-2"><LabeledField label="Academic session" required><select className={inputClass} value={sessionId} onChange={(event) => { setSessionId(event.target.value); setReview(null); }}><option value="" disabled>Select session</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</select></LabeledField><LabeledField label="Collection period" required><select className={inputClass} value={periodType} onChange={(event) => { setPeriodType(event.target.value as PeriodType); setReview(null); }}><option value="monthly">Monthly</option><option value="quarterly">Quarterly — 3 months</option><option value="half_yearly">Half-yearly — 6 months</option><option value="yearly">Yearly — 12 months</option><option value="custom">Custom months</option><option value="advance_only">Advance only</option></select></LabeledField></div>
    {periodType !== "advance_only" && <><LabeledField label={periodType === "custom" ? "Months (YYYY-MM, comma-separated)" : "Starting month"} required>{periodType === "custom" ? <input className={inputClass} value={customMonths} onChange={(event) => { setCustomMonths(event.target.value); setReview(null); }} placeholder="2026-10, 2026-11" /> : <input className={inputClass} type="month" value={start} onChange={(event) => { setStart(event.target.value); setReview(null); }} />}</LabeledField><p className="text-xs text-slate-500">Selected: {periods.length ? periods.join(", ") : "None"}. The backend validates enrollment and academic-session dates.</p><div className="flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={includeAdmission} disabled={!periods.length} onChange={(event) => { setIncludeAdmission(event.target.checked); setReview(null); }} /> Admission fee</label><label><input type="checkbox" checked={includeExam} disabled={!periods.length} onChange={(event) => { setIncludeExam(event.target.checked); setReview(null); }} /> Exam fee</label></div></>}
    {periodType === "yearly" && <LabeledField label="Optional yearly discount (%)"><input type="number" min="0" max="100" step="0.01" className={inputClass} value={yearlyDiscountPercent} onChange={(event) => { setYearlyDiscountPercent(event.target.value); setReview(null); }} /><p className="mt-1 text-xs text-slate-500">Requires administrator or manager approval and full settlement. The backend applies it only to tuition after the enrollment discount.</p></LabeledField>}
    <div className="grid gap-3 sm:grid-cols-2"><LabeledField label="Amount received (PKR)"><input type="number" min="0" step="0.01" className={inputClass} value={amount} onChange={(event) => { setAmount(event.target.value); setReview(null); }} /></LabeledField>{periodType !== "advance_only" && <LabeledField label="Existing credit to use (PKR)"><input type="number" min="0" step="0.01" className={inputClass} value={creditAmount} onChange={(event) => { setCreditAmount(event.target.value); setReview(null); }} /></LabeledField>}</div>
    {Number(amount) > 0 && <LabeledField label="Payment method"><select className={inputClass} value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setReview(null); }}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option></select></LabeledField>}
    <label className="block text-sm"><input type="checkbox" checked={retainCredit} onChange={(event) => { setRetainCredit(event.target.checked); setReview(null); }} /> I consent to retain any excess as advance credit</label>
    </fieldset>
    {review?.quoteOnly && <p className="text-sm text-slate-600 dark:text-slate-300">Enter the quoted settlement amount, then preview again to confirm.</p>}
    {preview && <section className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10"><p><strong>{preview.student_name}</strong> · {preview.session_name}</p><div className="grid grid-cols-2 gap-2"><span>Payable <Money fractionDigits={2} value={Number(preview.total_payable)} /></span><span>Previous dues <Money fractionDigits={2} value={preview.previous_dues.reduce((sum, fee) => sum + Number(fee.outstanding), 0)} /></span><span>Available credit <Money fractionDigits={2} value={Number(preview.available_credit)} /></span><span>Credit used <Money fractionDigits={2} value={Number(preview.credit_used)} /></span><span>Cash received <Money fractionDigits={2} value={Number(preview.cash_received)} /></span><span>Remaining due <Money fractionDigits={2} value={Number(preview.remaining_due)} /></span><span>New advance <Money fractionDigits={2} value={Number(preview.new_advance_credit)} /></span><span>Credit remaining <Money fractionDigits={2} value={Number(preview.remaining_advance_credit)} /></span></div><div className="border-t pt-2 dark:border-white/10">{preview.obligations.map((fee) => <p key={fee.billing_period}>{fee.billing_period}: tuition {fee.monthly_fee}, enrollment discount {fee.discount_amount}{Number(fee.yearly_discount_amount ?? 0) > 0 ? `, yearly discount ${fee.yearly_discount_amount}` : ""}, paid {fee.paid_amount}, balance {fee.outstanding}</p>)}</div></section>}
    <div className="flex flex-wrap justify-end gap-2 border-t pt-4 dark:border-white/10">
      <button type="button" className={secondaryButtonClass} disabled={submitting} onClick={onClose}>Cancel</button>
      {pending ? (
        <button type="button" className={primaryButtonClass} disabled={submitting || pending === "unavailable"} onClick={() => void confirm(true)}>
          {submitting ? "Confirming…" : "Retry confirmation"}
        </button>
      ) : preview && !review?.quoteOnly ? (
        <button type="button" className={primaryButtonClass} disabled={submitting} onClick={() => void confirm()}>Confirm payment</button>
      ) : (
        <button type="button" className={primaryButtonClass} disabled={loading} onClick={() => void requestPreview()}>
          {loading ? "Calculating…" : "Preview payment"}
        </button>
      )}
    </div>
  </div></Modal>;
}

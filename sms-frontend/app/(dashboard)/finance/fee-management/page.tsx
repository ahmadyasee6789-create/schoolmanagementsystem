"use client";

import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import {
  CheckCircle2,
  CircleDollarSign,
  FileText,
  ReceiptText,
  RefreshCw,
  UserRound,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
import { useAuthStore } from "@/app/store/authStore";
import FeeVoucherDialog from "@/components/finance/FeeVoucherDialog";
import {
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
  StatGrid,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/exams/ExamUi";
import {
  Badge,
  DataTable,
  InitialsAvatar,
  LabeledField,
  Money,
  Pagination,
  tableCellClass,
  tableHeadClass,
} from "@/components/finance/FinanceUi";

type Fee = {
  id: number;
  student_name: string;
  month: string;
  admission_fee: number;
  monthly_fee: number;
  exam_fee: number;
  total_amount: number;
  discount_percent: number;
  discount_amount: number;
  final_amount: number;
  paid_amount: number;
  due_amount: number;
  status: "paid" | "partial" | "unpaid";
};
type Classroom = {
  id: number;
  section: string;
  grade?: { name: string };
  grade_name?: string;
};
type AcademicSession = { id: number; name: string; start_date: string };
type PendingPayment = { key: string; feeId: number; amount: string };

function readPendingPayment(storageKey: string): PendingPayment | null {
  const saved = sessionStorage.getItem(storageKey);
  if (!saved) return null;
  const value: unknown = JSON.parse(saved);
  if (!value || typeof value !== "object" || !("key" in value) ||
      typeof value.key !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(value.key) ||
      !("feeId" in value) || typeof value.feeId !== "number" ||
      !Number.isSafeInteger(value.feeId) || value.feeId <= 0 ||
      !("amount" in value) || typeof value.amount !== "string" ||
      !/^\d{1,12}\.\d{2}$/.test(value.amount) || Number(value.amount) <= 0) {
    throw new Error("The saved payment needs review before another payment can be submitted.");
  }
  return { key: value.key, feeId: value.feeId, amount: value.amount };
}

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const limit = 10;
const classLabel = (classroom: Classroom) => {
  const grade = classroom.grade?.name ?? classroom.grade_name ?? "";
  return grade ? `${grade} – ${classroom.section}` : classroom.section;
};

function FeeStatus({ status }: { status: Fee["status"] }) {
  const config =
    status === "paid"
      ? (["Paid", "green"] as const)
      : status === "partial"
        ? (["Partial", "blue"] as const)
        : (["Unpaid", "red"] as const);
  return <Badge tone={config[1]}>{config[0]}</Badge>;
}

function PaymentProgress({ paid, total }: { paid: number; total: number }) {
  const percentage = total ? Math.min((paid / total) * 100, 100) : 0;
  return (
    <div className="min-w-28">
      <div className="flex justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>{Math.round(percentage)}%</span>
        <span>{new Intl.NumberFormat("en-PK").format(paid)} paid</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function VoucherButton({ fee, onClick }: { fee: Fee; onClick: () => void }) {
  const unavailable = fee.paid_amount > 0;
  return (
    <button type="button" onClick={onClick} disabled={unavailable}
      title={unavailable ? "Vouchers can only be issued before payment" : "Preview and print fee voucher"}
      aria-label={`Voucher for ${fee.student_name}`}
      className={`${secondaryButtonClass} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40`}>
      <FileText size={14} />Voucher
    </button>
  );
}

function FeeCard({ fee, onCollect, onVoucher }: { fee: Fee; onCollect: () => void; onVoucher: () => void }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <InitialsAvatar name={fee.student_name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
              {fee.student_name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {fee.month}
            </p>
          </div>
        </div>
        <FeeStatus status={fee.status} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs dark:border-white/5">
        <div>
          <p className="text-slate-400 dark:text-slate-500">Final amount</p>
          <Money value={fee.final_amount} className="mt-1 block" />
        </div>
        <div>
          <p className="text-slate-400 dark:text-slate-500">Due</p>
          <Money
            value={fee.due_amount}
            className="mt-1 block text-red-600 dark:text-red-400"
          />
        </div>
      </div>
      <div className="mt-3">
        <PaymentProgress paid={fee.paid_amount} total={fee.final_amount} />
      </div>
      <div className="mt-4"><VoucherButton fee={fee} onClick={onVoucher} /></div>
      {fee.status !== "paid" && (
        <button
          type="button"
          onClick={onCollect}
          className={`${secondaryButtonClass} mt-4 w-full border-emerald-400/30 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10`}
        >
          Collect payment
        </button>
      )}
    </article>
  );
}

export default function FeeManagementPage() {
  const user = useAuthStore((state) => state.user);
  const paymentStorageKey = user?.org_id && user.id
    ? `pending-fee-payment:${user.org_id}:${user.id}` : null;
  const paymentInFlight = useRef(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [classId, setClassId] = useState("");
  const [month, setMonth] = useState("");
  const [orderedMonths, setOrderedMonths] = useState(months);
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedFee, setSelectedFee] = useState<Fee | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [voucherFee, setVoucherFee] = useState<Fee | null>(null);
  const [bulkVoucher, setBulkVoucher] = useState<{ classId: number; month: string; classroom: string } | null>(null);

  useEffect(() => {
    setPendingPayment(null);
    if (!paymentStorageKey) return;
    try {
      setPendingPayment(readPendingPayment(paymentStorageKey));
    } catch {
      toast.error("Unable to read the saved payment. Check this tab's payment before submitting again.");
    }
  }, [paymentStorageKey]);

  useEffect(() => {
    void Promise.all([api.get("/classes"), api.get("/sessions/active")])
      .then(([classesResponse, sessionsResponse]) => {
        setClasses(classesResponse.data);
        const activeSession: AcademicSession | undefined =
          sessionsResponse.data;
        if (activeSession?.start_date) {
          const start = Number(activeSession.start_date.slice(5, 7)) - 1;
          if (start >= 0 && start < 12) {
            setOrderedMonths([...months.slice(start), ...months.slice(0, start)]);
          }
        }
      })
      .catch(() => toast.error("Failed to load fee options"));
  }, []);

  const fetchLedger = async (targetPage = page) => {
    if (!classId || !month) return;
    setLoading(true);
    try {
      const response = await api.get("/fees/ledger", {
        params: { class_id: classId, month, page: targetPage, limit },
      });
      setFees(response.data.items ?? []);
      setTotalPages(response.data.total_pages ?? 1);
    } catch {
      toast.error("Failed to load fee ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLedger(page);
  }, [classId, month, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (!classId || !month) return toast.error("Select class and month first");
    setGenerating(true);
    try {
      const response = await api.post("/fees/generate", null, {
        params: { class_id: classId, month },
      });
      toast.success(response.data.message);
      setPage(1);
      await fetchLedger(1);
    } catch (error: unknown) {
      toast.error(isAxiosError(error) && typeof error.response?.data?.detail === "string" ? error.response.data.detail : "Failed to generate fees");
    } finally {
      setGenerating(false);
    }
  };

  const openPayment = (fee: Fee) => {
    if (pendingPayment && pendingPayment.feeId !== fee.id) {
      toast.error("Retry the pending payment before starting another payment in this tab.");
      return;
    }
    setSelectedFee(fee);
    setPaymentAmount(pendingPayment?.amount ?? String(fee.due_amount));
  };

  const handleCollect = async (retryPending = false) => {
    if (paymentInFlight.current) return;
    if (!paymentStorageKey) return toast.error("Sign in to your school before collecting payment.");
    paymentInFlight.current = true;
    let submitted = false;
    let wasPending = false;
    try {
      // Read storage again so closing/reopening the dialog cannot lose an uncertain request.
      let attempt = readPendingPayment(paymentStorageKey);
      wasPending = attempt !== null;
      if (attempt) {
        if (!retryPending && (selectedFee?.id !== attempt.feeId || Number(paymentAmount) !== Number(attempt.amount))) {
          toast.error("Retry the original pending payment before changing the amount.");
          return;
        }
      } else {
        if (!selectedFee || retryPending) return;
        const amount = Number(paymentAmount);
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(paymentAmount) || !Number.isFinite(amount) || amount <= 0) {
          toast.error("Enter a positive amount with at most two decimal places.");
          return;
        }
        if (amount > selectedFee.due_amount) {
          toast.error(`Amount exceeds due of PKR ${new Intl.NumberFormat("en-PK").format(selectedFee.due_amount)}`);
          return;
        }
        attempt = { key: crypto.randomUUID(), feeId: selectedFee.id, amount: amount.toFixed(2) };
        // Persist before sending; if storage is unavailable, no payment is sent.
        sessionStorage.setItem(paymentStorageKey, JSON.stringify(attempt));
      }
      setPendingPayment(attempt);
      setPaymentAmount(attempt.amount);
      setPaying(true);
      submitted = true;
      await api.post(`/fees/${attempt.feeId}/collect`, { amount: attempt.amount }, {
        headers: { "Idempotency-Key": attempt.key },
        timeout: 30000,
      });
      sessionStorage.removeItem(paymentStorageKey);
      setPendingPayment(null);
      toast.success("Payment collected successfully");
      setSelectedFee(null);
      setPaymentAmount("");
      await fetchLedger(page);
    } catch (error: unknown) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      // A 400 from collection means the server checked this key and rejected an
      // unrecorded payment. Auth/validation failures cannot resolve an older request.
      if (submitted && (status === 400 || (!wasPending && [401, 403, 404, 422].includes(status ?? 0)))) {
        sessionStorage.removeItem(paymentStorageKey);
        setPendingPayment(null);
      }
      const detail = isAxiosError(error) && typeof error.response?.data?.detail === "string"
        ? error.response.data.detail : submitted
          ? "Payment confirmation was not received. Retry the pending payment; do not enter it again."
          : "Unable to save the payment safely in this tab. No new payment was sent.";
      toast.error(detail);
    } finally {
      paymentInFlight.current = false;
      setPaying(false);
    }
  };

  const totalCollected = fees.reduce((sum, fee) => sum + fee.paid_amount, 0);
  const totalDue = fees.reduce((sum, fee) => sum + fee.due_amount, 0);
  const paidCount = fees.filter((fee) => fee.status === "paid").length;
  const pendingCount = fees.length - paidCount;
  const selectedClassroom = classes.find((item) => String(item.id) === classId);

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader
        title="Fee Management"
        subtitle="Generate fees, print vouchers and collect payments by class and month"
      />

      {pendingPayment && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p>Payment of PKR {pendingPayment.amount} for fee #{pendingPayment.feeId} is awaiting confirmation. Retry to confirm the same payment and keep this tab open until confirmed.</p>
          <button type="button" disabled={paying} onClick={() => void handleCollect(true)} className={secondaryButtonClass}>
            {paying ? "Confirming…" : "Retry pending payment"}
          </button>
        </div>
      )}

      <section className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-2 lg:grid-cols-12">
        <select
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setPage(1);
          }}
          className={`${inputClass} lg:col-span-4`}
          aria-label="Class"
        >
          <option value="" disabled>
            Select class
          </option>
          {classes.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classLabel(classroom)}
            </option>
          ))}
        </select>
        <select
          value={month}
          onChange={(event) => {
            setMonth(event.target.value);
            setPage(1);
          }}
          className={`${inputClass} lg:col-span-3`}
          aria-label="Month"
        >
          <option value="" disabled>
            Select month
          </option>
          {orderedMonths.map((monthName) => (
            <option key={monthName} value={monthName}>
              {monthName}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !classId || !month}
            className={`${primaryButtonClass} flex flex-1 items-center justify-center gap-2 whitespace-nowrap`}
          >
            <RefreshCw size={16} className={generating ? "animate-spin" : ""} />
            {generating ? "Generating…" : "Generate Fees"}
          </button>
          <button type="button" disabled={generating || loading || !selectedClassroom || !month}
            onClick={() => selectedClassroom && setBulkVoucher({ classId: selectedClassroom.id, month, classroom: classLabel(selectedClassroom) })}
            className={`${secondaryButtonClass} flex flex-1 items-center justify-center gap-2 whitespace-nowrap`}>
            <FileText size={16} />Bulk vouchers
          </button>
        </div>
      </section>

      {fees.length > 0 && (
        <StatGrid
          stats={[
            {
              label: "Collected",
              value: `PKR ${new Intl.NumberFormat("en-PK").format(totalCollected)}`,
              Icon: CheckCircle2,
              tone: "border-emerald-400/20 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400",
            },
            {
              label: "Due",
              value: `PKR ${new Intl.NumberFormat("en-PK").format(totalDue)}`,
              Icon: XCircle,
              tone: "border-red-400/20 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400",
            },
            {
              label: "Paid Students",
              value: paidCount,
              Icon: UserRound,
              tone: "border-blue-400/20 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400",
            },
            {
              label: "Pending",
              value: pendingCount,
              Icon: ReceiptText,
              tone: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]",
            },
          ]}
        />
      )}

      {loading ? (
        <LoadingState />
      ) : fees.length === 0 ? (
        <EmptyState
          icon={CircleDollarSign}
          message={
            classId && month
              ? "No fees found. Generate fees to create the ledger."
              : "Select a class and month to view fees"
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:hidden">
            {fees.map((fee) => (
              <FeeCard
                key={fee.id}
                fee={fee}
                onVoucher={() => setVoucherFee(fee)}
                onCollect={() => openPayment(fee)}
              />
            ))}
          </div>
          <DataTable>
            <thead className="bg-slate-50 dark:bg-white/[0.03]">
              <tr>
                {[
                  "Student",
                  "Admission",
                  "Monthly",
                  "Exam",
                  "Total",
                  "Discount",
                  "Final",
                  "Payment",
                  "Status",
                  "",
                ].map((heading) => (
                  <th key={heading} className={tableHeadClass}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr
                  key={fee.id}
                  className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]"
                >
                  <td
                    className={`${tableCellClass} font-semibold text-slate-900 dark:text-slate-100`}
                  >
                    <span className="flex items-center gap-2">
                      <InitialsAvatar name={fee.student_name} />
                      {fee.student_name}
                    </span>
                  </td>
                  <td className={tableCellClass}>
                    <Money value={fee.admission_fee} />
                  </td>
                  <td className={tableCellClass}>
                    <Money value={fee.monthly_fee} />
                  </td>
                  <td className={tableCellClass}>
                    <Money value={fee.exam_fee} />
                  </td>
                  <td className={tableCellClass}>
                    <Money value={fee.total_amount} />
                  </td>
                  <td className={tableCellClass}>
                    {fee.discount_percent > 0 ? (
                      <Badge tone="purple">
                        {fee.discount_percent}% · PKR{" "}
                        {new Intl.NumberFormat("en-PK").format(
                          fee.discount_amount,
                        )}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={tableCellClass}>
                    <Money value={fee.final_amount} />
                  </td>
                  <td className={tableCellClass}>
                    <PaymentProgress
                      paid={fee.paid_amount}
                      total={fee.final_amount}
                    />
                  </td>
                  <td className={tableCellClass}>
                    <FeeStatus status={fee.status} />
                  </td>
                  <td className={tableCellClass}>
                    <div className="flex items-center gap-2">
                      <VoucherButton fee={fee} onClick={() => setVoucherFee(fee)} />
                      {fee.status !== "paid" && (
                        <button
                          type="button"
                          onClick={() => openPayment(fee)}
                          className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                        >
                          Collect
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {bulkVoucher && (
        <FeeVoucherDialog bulk={bulkVoucher} classroom={bulkVoucher.classroom}
          onClose={() => setBulkVoucher(null)} />
      )}

      {voucherFee && (
        <FeeVoucherDialog key={voucherFee.id} fee={voucherFee}
          classroom={selectedClassroom ? classLabel(selectedClassroom) : ""}
          onClose={() => setVoucherFee(null)} />
      )}

      {selectedFee && (
        <Modal
          title="Collect Payment"
          onClose={() => !paying && setSelectedFee(null)}
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-[#8B6DF2]/20 bg-[#8B6DF2]/10 p-4">
              <div className="flex items-center gap-3">
                <InitialsAvatar name={selectedFee.student_name} />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
                    {selectedFee.student_name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedFee.month}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <PaymentProgress
                  paid={selectedFee.paid_amount}
                  total={selectedFee.final_amount}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Amount due
              </span>
              <Money
                value={selectedFee.due_amount}
                className="text-red-600 dark:text-red-400"
              />
            </div>
            <LabeledField label="Payment Amount" required>
              <input
                autoFocus
                type="number"
                min="0.01"
                step="0.01"
                max={pendingPayment ? undefined : selectedFee.due_amount}
                disabled={paying || pendingPayment !== null}
                value={paymentAmount}
                onKeyDown={(event) =>
                  event.key === "Enter" && void handleCollect()
                }
                onChange={(event) => setPaymentAmount(event.target.value)}
                className={inputClass}
              />
            </LabeledField>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/5">
              <button
                type="button"
                disabled={paying}
                onClick={() => setSelectedFee(null)}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={paying || !paymentAmount}
                onClick={() => void handleCollect()}
                className={primaryButtonClass}
              >
                {paying ? "Processing…" : pendingPayment ? "Retry pending payment" : "Submit Payment"}
              </button>
            </div>
          </div>
        </Modal> 
      )}
    </div>
  );
}

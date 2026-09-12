"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDollarSign,
  ReceiptText,
  RefreshCw,
  UserRound,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/app/lib/api";
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

function FeeCard({ fee, onCollect }: { fee: Fee; onCollect: () => void }) {
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

  useEffect(() => {
    void Promise.all([api.get("/classes"), api.get("/sessions")])
      .then(([classesResponse, sessionsResponse]) => {
        setClasses(classesResponse.data);
        const activeSession: AcademicSession | undefined =
          sessionsResponse.data[0];
        if (activeSession?.start_date) {
          const start = new Date(activeSession.start_date).getMonth();
          setOrderedMonths([...months.slice(start), ...months.slice(0, start)]);
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
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Failed to generate fees");
    } finally {
      setGenerating(false);
    }
  };

  const handleCollect = async () => {
    if (!selectedFee) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    if (amount > selectedFee.due_amount)
      return toast.error(
        `Amount exceeds due of PKR ${new Intl.NumberFormat("en-PK").format(selectedFee.due_amount)}`,
      );
    setPaying(true);
    try {
      await api.post(`/fees/${selectedFee.id}/collect`, { amount });
      toast.success("Payment collected successfully");
      setSelectedFee(null);
      setPaymentAmount("");
      await fetchLedger(page);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Failed to collect payment");
    } finally {
      setPaying(false);
    }
  };

  const totalCollected = fees.reduce((sum, fee) => sum + fee.paid_amount, 0);
  const totalDue = fees.reduce((sum, fee) => sum + fee.due_amount, 0);
  const paidCount = fees.filter((fee) => fee.status === "paid").length;
  const pendingCount = fees.length - paidCount;

  return (
    <div className="min-h-full bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader
        title="Fee Management"
        subtitle="Generate and collect student fee payments by class and month"
      />

      <section className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-2 lg:grid-cols-12">
        <select
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setPage(1);
          }}
          className={`${inputClass} lg:col-span-5`}
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
          className={`${inputClass} lg:col-span-4`}
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
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !classId || !month}
          className={`${primaryButtonClass} flex items-center justify-center gap-2 lg:col-span-3`}
        >
          <RefreshCw size={16} className={generating ? "animate-spin" : ""} />
          {generating ? "Generating…" : "Generate Fees"}
        </button>
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
                onCollect={() => {
                  setSelectedFee(fee);
                  setPaymentAmount(String(fee.due_amount));
                }}
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
                    {fee.status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFee(fee);
                          setPaymentAmount(String(fee.due_amount));
                        }}
                        className="rounded-lg border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                      >
                        Collect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
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
                min={1}
                max={selectedFee.due_amount}
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
                {paying ? "Processing…" : "Submit Payment"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

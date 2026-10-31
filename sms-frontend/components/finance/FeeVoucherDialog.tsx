"use client";

import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Download, ExternalLink, FileText } from "lucide-react";
import { api } from "@/app/lib/api";
import {
  Modal,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/exams/ExamUi";
import { LabeledField } from "./FinanceUi";

type VoucherFee = { id: number; student_name: string; month: string };
type VoucherProps = {
  classroom: string;
  onClose: () => void;
} & (
  | { fee: VoucherFee; bulk?: never }
  | { fee?: never; bulk: { classId: number; month: string } }
);

async function voucherError(error: unknown): Promise<string> {
  const fallback = "Could not generate the voucher. Please try again.";
  if (!isAxiosError(error)) return fallback;
  let data: unknown = error.response?.data;
  if (data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch {
      return fallback;
    }
  }
  if (
    data &&
    typeof data === "object" &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }
  return fallback;
}

export default function FeeVoucherDialog({
  fee,
  bulk,
  classroom,
  onClose,
}: VoucherProps) {
  const [dueDate, setDueDate] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<{
    count: number;
    skipped: number;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const filename = bulk
    ? `vouchers-class-${bulk.classId}-${bulk.month}-${dueDate}.pdf`
    : `voucher-${fee.id}.pdf`;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  const clearPreview = () => {
    setPdfUrl(null);
    setSummary(null);
    setError("");
  };

  const generateVoucher = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dueDate || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setPdfUrl(null);
    setSummary(null);
    try {
      const url = bulk ? "/fees/vouchers/bulk" : `/fees/${fee.id}/voucher`;
      const config = {
        params: bulk
          ? { class_id: bulk.classId, month: bulk.month, due_date: dueDate }
          : { due_date: dueDate },
        responseType: "blob" as const,
        signal: controller.signal,
      };
      const response = await api.get<Blob>(url, config);
      if (controller.signal.aborted) return;
      if (response.data.type !== "application/pdf") {
        throw new Error("Unexpected voucher response");
      }
      setPdfUrl(URL.createObjectURL(response.data));
      if (bulk) {
        const count = Number(response.headers["x-voucher-count"]);
        const skipped = Number(response.headers["x-voucher-skipped"]);
        if (
          Number.isInteger(count) &&
          count > 0 &&
          Number.isInteger(skipped) &&
          skipped >= 0
        ) {
          setSummary({ count, skipped });
        }
      }
    } catch (cause) {
      const message = await voucherError(cause);
      if (!controller.signal.aborted) setError(message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (request.current === controller) request.current = null;
    }
  };

  return (
    <Modal
      title={bulk ? "Bulk fee vouchers" : "Fee voucher"}
      onClose={onClose}
      size="md"
    >
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
        {bulk ? classroom : fee.student_name}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {bulk ? bulk.month : `${classroom} · ${fee.month}`}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {bulk
          ? "Generate one PDF for the whole class and month across all ledger pages. Fees with recorded payments are skipped. Each student gets one A4 page with a student copy and a school copy, including discounts and previous arrears."
          : "Choose the payment due date. The voucher includes current fees, discounts and any unpaid earlier months in this session, with a student copy and a school copy."}
      </p>
      <form
        onSubmit={generateVoucher}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1">
          <LabeledField label="Due date" required>
            <input
              type="date"
              required
              value={dueDate}
              disabled={loading}
              className={inputClass}
              onChange={(event) => {
                setDueDate(event.target.value);
                clearPreview();
              }}
            />
          </LabeledField>
        </div>
        <button
          type="submit"
          disabled={loading || !dueDate}
          className={`${primaryButtonClass} flex items-center gap-2`}
        >
          <FileText size={16} />
          {loading
            ? "Generating…"
            : bulk
              ? "Generate vouchers"
              : "Preview voucher"}
        </button>
      </form>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {pdfUrl && (
        <div className="mt-5 space-y-3">
          {summary && (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              {summary.count} {summary.count === 1 ? "voucher" : "vouchers"}{" "}
              ready. {summary.skipped} skipped because payments are already
              recorded.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${primaryButtonClass} inline-flex items-center gap-2`}
            >
              <ExternalLink size={16} />
              Open / Print PDF
            </a>
            <a
              href={pdfUrl}
              download={filename}
              className={`${secondaryButtonClass} inline-flex items-center gap-2`}
            >
              <Download size={16} />
              Download PDF
            </a>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Print on A4 landscape. If the preview is unavailable, open or
            download the PDF.
          </p>
          <iframe
            title={
              bulk
                ? `Fee vouchers for ${classroom}`
                : `Fee voucher for ${fee.student_name}`
            }
            src={pdfUrl}
            className="h-[55vh] min-h-64 w-full rounded-lg border border-slate-200 bg-slate-100 dark:border-white/10"
          />
        </div>
      )}
    </Modal>
  );
}

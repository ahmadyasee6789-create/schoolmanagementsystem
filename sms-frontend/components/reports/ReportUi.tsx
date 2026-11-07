"use client";

import { useState, type Key, type ReactNode } from "react";
import { Download, ListFilter, RefreshCw, type LucideIcon } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import {
  EmptyState, LoadingState, PageHeader, inputClass, primaryButtonClass, secondaryButtonClass,
} from "@/components/exams/ExamUi";
import {
  Badge, DataTable, InitialsAvatar, LabeledField, panelClass, tableCellClass, tableHeadClass,
} from "@/components/finance/FinanceUi";

const statTones = {
  purple: { colorHex: "#A78BFA", dimBgClass: "bg-violet-50 dark:bg-[#A78BFA]/10" },
  blue: { colorHex: "#60A5FA", dimBgClass: "bg-blue-50 dark:bg-[#60A5FA]/10" },
  green: { colorHex: "#34D399", dimBgClass: "bg-green-50 dark:bg-[#34D399]/10" },
  red: { colorHex: "#F87171", dimBgClass: "bg-red-50 dark:bg-[#F87171]/10" },
  amber: { colorHex: "#F59E0B", dimBgClass: "bg-amber-50 dark:bg-[#F59E0B]/10" },
};

type Stat = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone: keyof typeof statTones;
  sub?: string;
};

export function ReportPage({
  title, subtitle, onRefresh, onExport, refreshing, exportDisabled = false, exportActions, error, stats, children,
}: {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  onExport?: () => void;
  refreshing: boolean;
  exportDisabled?: boolean;
  exportActions?: ReactNode;
  error?: string;
  stats: Stat[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-full min-w-0 bg-white p-4 dark:bg-[#0D1117] sm:p-6 md:p-8">
      <PageHeader title={title} subtitle={subtitle} actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} disabled={refreshing} className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
            <RefreshCw size={16} aria-hidden="true" className={refreshing ? "motion-safe:animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {exportActions ?? <button type="button" onClick={onExport} disabled={exportDisabled} className={`${primaryButtonClass} inline-flex items-center gap-2`}>
            <Download size={16} aria-hidden="true" />Export PDF
          </button>}
        </div>
      } />
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
      <div className={`mb-6 grid grid-cols-2 gap-3 [overflow-wrap:anywhere] sm:gap-4 ${stats.length > 4 ? "md:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-4"}`}>
        {stats.map(({ tone, ...stat }) => <StatCard key={stat.title} {...stat} {...statTones[tone]} />)}
      </div>
      {children}
    </div>
  );
}

export function ReportFilters({ count, children }: { count: number; children: ReactNode }) {
  return (
    <section aria-label="Report filters" className={`${panelClass} mb-6 p-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <ListFilter size={16} className="text-[#8B6DF2]" aria-hidden="true" />Filters
        </h2>
        <span role="status"><Badge>{count} {count === 1 ? "result" : "results"}</Badge></span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">{children}</div>
    </section>
  );
}

export function ReportFilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <LabeledField label={label}>
      <select aria-label={label} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </LabeledField>
  );
}

export function ReportTable({ label, personColumn = "Student", columns, rows, loading, icon, empty }: {
  label: string;
  personColumn?: string;
  columns: string[];
  rows: { key: Key; person: ReactNode; values: ReactNode[] }[];
  loading: boolean;
  icon: LucideIcon;
  empty: string;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const current = Math.min(page, pages);
  const offset = (current - 1) * 50;
  const visibleRows = rows.slice(offset, offset + 50);
  if (loading) return <div role="status"><span className="sr-only">Loading report</span><LoadingState /></div>;
  if (!rows.length) return <EmptyState icon={icon} message={empty} />;

  return (
    <>
      {pages > 1 && <nav aria-label="Report pagination" className="mb-4 flex items-center justify-end gap-3 text-sm text-slate-600 dark:text-slate-300">
        <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} className={secondaryButtonClass}>Previous</button>
        <span>Page {current} of {pages} · {rows.length} records</span>
        <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} className={secondaryButtonClass}>Next</button>
      </nav>}
      <ul aria-label={label} className="grid gap-3 sm:hidden">
        {visibleRows.map(({ key, person, values }, index) => (
          <li key={key} className={`${panelClass} min-w-0 p-4`}>
            <div className="flex items-start justify-between gap-3">
              {person}
              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">#{offset + index + 1}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-white/5">
              {values.map((value, cell) => (
                <div key={columns[cell]} className="min-w-0">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{columns[cell]}</dt>
                  <dd className="mt-1 text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <DataTable label={label}>
        <thead className="bg-slate-50 dark:bg-white/[0.03]">
          <tr>{["#", personColumn, ...columns].map((column) => (
            <th key={column} scope="col" className={tableHeadClass}>{column}</th>
          ))}</tr>
        </thead>
        <tbody>{visibleRows.map(({ key, person, values }, index) => (
          <tr key={key} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[0.02]">
            <td className={tableCellClass}>{offset + index + 1}</td>
            <th scope="row" className={`${tableCellClass} text-left`}>{person}</th>
            {values.map((value, cell) => <td key={columns[cell]} className={tableCellClass}>{value}</td>)}
          </tr>
        ))}</tbody>
      </DataTable>
    </>
  );
}

export function ReportPerson({ name, admissionNo }: { name: string; admissionNo?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <InitialsAvatar name={name} />
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
        {admissionNo && <p className="text-xs font-normal text-slate-500 dark:text-slate-400">{admissionNo}</p>}
      </div>
    </div>
  );
}

export function ReportClass({ grade, section }: { grade: string | null; section?: string | null }) {
  return grade ? <Badge>{section ? `${grade} – ${section}` : grade}</Badge> : <>Not enrolled</>;
}

const progressTones = { green: "bg-emerald-500", red: "bg-red-500", amber: "bg-amber-500", purple: "bg-[#8B6DF2]" };

export function ReportProgress({ value, percent, detail = `${percent}%`, tone }: {
  value: string;
  percent: number;
  detail?: string;
  tone: keyof typeof progressTones;
}) {
  return (
    <div className="sm:min-w-28">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
        <span className="text-slate-500 dark:text-slate-400">{detail}</span>
      </div>
      <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div className={`h-full rounded-full ${progressTones[tone]}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}

export function ReportPayment({ paid, total }: { paid: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return <ReportProgress value={`₨${paid.toLocaleString()}`} percent={percent} tone={percent === 100 ? "green" : percent > 0 ? "purple" : "red"} />;
}

export function ReportPaymentStatus({ status }: { status: "paid" | "partial" | "unpaid" }) {
  if (status === "paid") return <Badge tone="green">Paid</Badge>;
  if (status === "partial") return <Badge tone="blue">Partial</Badge>;
  return <Badge tone="red">Unpaid</Badge>;
}

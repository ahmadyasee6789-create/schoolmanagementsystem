"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const money = (value: number) => `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(value ?? 0)}`;
export const errorMessage = (error: unknown, fallback: string) => (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;

export const panelClass = "rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]";
export const tableHeadClass = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
export const tableCellClass = "px-4 py-3 text-sm text-slate-600 dark:text-slate-300";

export function SectionLabel({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return <h3 className="mb-3 flex items-center gap-2 border-l-2 border-[#8B6DF2] pl-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{Icon && <Icon size={14} className="text-[#8B6DF2]" />}{children}</h3>;
}

export function Money({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`font-mono text-sm font-semibold text-slate-800 dark:text-slate-100 ${className}`}>{money(value)}</span>;
}

export function Badge({ children, tone = "purple" }: { children: React.ReactNode; tone?: "purple" | "blue" | "green" | "red" | "slate" }) {
  const tones = {
    purple: "border-[#8B6DF2]/20 bg-[#8B6DF2]/10 text-[#8B6DF2]",
    blue: "border-blue-400/25 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400",
    green: "border-emerald-400/25 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400",
    red: "border-red-400/25 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400",
    slate: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function InitialsAvatar({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8B6DF2]/10 text-xs font-bold text-[#8B6DF2]">{initials}</span>;
}

export function DataTable({ children }: { children: React.ReactNode }) {
  return <div className={`${panelClass} hidden overflow-x-auto sm:block`}><table className="w-full min-w-max border-collapse">{children}</table></div>;
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages < 2) return null;
  return <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-4 py-3 dark:border-white/5"><button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5" aria-label="Previous page"><ChevronLeft size={17} /></button><span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</span><button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-white/5" aria-label="Next page"><ChevronRight size={17} /></button></div>;
}

export function LabeledField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}{required && <span className="ml-1 text-red-500">*</span>}<span className="mt-1.5 block">{children}</span></label>;
}

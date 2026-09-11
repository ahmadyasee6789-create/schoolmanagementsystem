"use client";

import type { LucideIcon } from "lucide-react";

export const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonClass = "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";
export const primaryButtonClass = "rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40";

export function LoadingState() {
  return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div>;
}

export function EmptyState({ icon: Icon, message, actionLabel, onAction }: { icon: LucideIcon; message: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 text-center dark:border-white/10"><Icon size={32} className="mb-3 text-slate-300 dark:text-slate-600" /><p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>{actionLabel && onAction && <button type="button" onClick={onAction} className={`${primaryButtonClass} mt-4`}>{actionLabel}</button>}</div>;
}

export function PageHeader({ title, subtitle, actionLabel, onAction, disabled = false, badge }: { title: string; subtitle: string; actionLabel?: string; onAction?: () => void; disabled?: boolean; badge?: string }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">{title}</h1>{badge && <span className="rounded-md border border-emerald-400/25 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400">{badge}</span>}</div><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p></div>{actionLabel && onAction && <button type="button" onClick={onAction} disabled={disabled} className={primaryButtonClass}>{actionLabel}</button>}</div>;
}

export function StatGrid({ stats }: { stats: { label: string; value: string | number; Icon: LucideIcon; tone: string }[] }) {
  return <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">{stats.map(({ label, value, Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-center justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tone}`}><Icon size={18} /></span><span className="text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</span></div><p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p></div>)}</div>;
}

export function Modal({ title, children, onClose, size = "sm" }: { title: string; children: React.ReactNode; onClose: () => void; size?: "sm" | "md" }) {
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}><div className={`mx-auto my-6 w-full ${size === "md" ? "max-w-2xl" : "max-w-sm"} rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-[#1a2233]`}><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-base font-bold text-slate-900 dark:text-slate-50">{title}</h2><button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300" aria-label="Close"><span aria-hidden>×</span></button></div>{children}</div></div>;
}

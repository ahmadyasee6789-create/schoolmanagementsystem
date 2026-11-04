"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useRef } from "react";

let openModals = 0;
let originalBodyOverflow = "";

export const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8B6DF2] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonClass = "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";
export const primaryButtonClass = "rounded-lg bg-[#8B6DF2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40";

export function LoadingState() {
  return <div className="flex justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#8B6DF2]/20 border-t-[#8B6DF2]" /></div>;
}

export function EmptyState({ icon: Icon, message, actionLabel, onAction }: { icon: LucideIcon; message: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 text-center dark:border-white/10"><Icon size={32} className="mb-3 text-slate-300 dark:text-slate-600" /><p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>{actionLabel && onAction && <button type="button" onClick={onAction} className={`${primaryButtonClass} mt-4`}>{actionLabel}</button>}</div>;
}

export function PageHeader({ title, subtitle, actionLabel, onAction, disabled = false, badge, actions }: { title: string; subtitle: string; actionLabel?: string; onAction?: () => void; disabled?: boolean; badge?: string; actions?: React.ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-[1.45rem] font-bold text-slate-900 dark:text-slate-50">{title}</h1>{badge && <span className="rounded-md border border-emerald-400/25 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400">{badge}</span>}</div><p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p></div>{actionLabel && onAction && <button type="button" onClick={onAction} disabled={disabled} className={primaryButtonClass}>{actionLabel}</button>}{actions}</div>;
}

export function StatGrid({ stats }: { stats: { label: string; value: string | number; Icon: LucideIcon; tone: string }[] }) {
  return <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">{stats.map(({ label, value, Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-center justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tone}`}><Icon size={18} /></span><span className="text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</span></div><p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p></div>)}</div>;
}

export function Modal({ title, children, onClose, size = "sm", busy = false }: { title: string; children: React.ReactNode; onClose: () => void; size?: "sm" | "md"; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openModals === 0) originalBodyOverflow = document.body.style.overflow;
    openModals++;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      openModals--;
      if (openModals === 0) document.body.style.overflow = originalBodyOverflow;
      opener?.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true" tabIndex={-1}
    onKeyDown={(event) => {
      if (event.key !== "Tab" || (event.target as HTMLElement).closest("dialog") !== event.currentTarget) return;
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0 && element.closest("dialog") === event.currentTarget);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { event.preventDefault(); event.currentTarget.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${size === "md" ? "max-w-2xl" : "max-w-sm"} overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:border-white/10 dark:bg-[#1a2233] dark:text-slate-100`}>
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/10">
        <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-slate-50">{title}</h2>
        <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:hover:bg-white/5 dark:hover:text-slate-300" aria-label="Close"><span aria-hidden>×</span></button>
      </div>
      <div className="min-h-0 overflow-y-auto p-5">{children}</div>
    </div>
  </dialog>;
}

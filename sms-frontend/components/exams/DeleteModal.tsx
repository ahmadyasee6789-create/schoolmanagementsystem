"use client";

import { AlertTriangle } from "lucide-react";
import { Modal, secondaryButtonClass } from "./ExamUi";

export default function DeleteModal({ title, description, loading, onClose, onConfirm }: { title: string; description: string; loading: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Modal title={title} onClose={onClose}><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10"><AlertTriangle size={18} className="text-red-500" /></span><p className="text-sm text-slate-500 dark:text-slate-400">{description}</p></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={loading} className={secondaryButtonClass}>Cancel</button><button type="button" onClick={onConfirm} disabled={loading} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Deleting…" : "Delete"}</button></div></Modal>;
}

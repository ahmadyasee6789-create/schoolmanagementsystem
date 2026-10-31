import { AlertCircle } from "lucide-react";
import { secondaryButtonClass } from "./types";

export function StudentSkeleton() {
  return <div role="status" aria-label="Loading student information" className="space-y-5">
    <span className="sr-only">Loading student information…</span>
    <div aria-hidden="true" className="animate-pulse space-y-6 rounded-xl border border-slate-200 p-5 dark:border-white/10">
      <div className="h-6 w-1/2 rounded bg-slate-100 dark:bg-white/10" />
      <div className="grid gap-5 sm:grid-cols-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-2"><div className="h-3 w-24 rounded bg-slate-100 dark:bg-white/10" /><div className="h-5 w-3/4 rounded bg-slate-100 dark:bg-white/10" /></div>)}</div>
    </div>
  </div>;
}

export function StudentError({ message, retry }: { message: string; retry?: () => void }) {
  return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-500/20 dark:bg-red-500/5">
    <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300"><AlertCircle size={18} className="shrink-0" />{message}</p>
    {retry && <button type="button" onClick={retry} className={`${secondaryButtonClass} mt-4`}>Try again</button>}
  </div>;
}

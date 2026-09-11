interface DashboardErrorProps {
  error: string;
  role?: string;
  onGoToSessions: () => void;
  onRetry: () => void;
}

export default function DashboardError({ error, role, onGoToSessions, onRetry }: DashboardErrorProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-white p-6 dark:bg-[#111827]">
      <div className="w-full max-w-[500px] rounded-2xl border border-red-300/40 bg-white p-8 text-center dark:border-red-400/25 dark:bg-[#161D2B]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-300/30 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10">
          <span className="text-[28px]">⚠️</span>
        </div>

        <h2 className="mb-3 text-xl font-bold text-slate-900 dark:text-slate-50">
          Unable to Load Dashboard
        </h2>

        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{error}</p>

        {role === "admin" ? (
          <button
            onClick={onGoToSessions}
            className="rounded-lg bg-[#F59E0B] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E68A00]"
          >
            Go to Academic Sessions
          </button>
        ) : (
          <button
            onClick={onRetry}
            className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:border-[#F59E0B] hover:bg-[#F59E0B]/10 dark:border-white/10 dark:text-slate-50"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
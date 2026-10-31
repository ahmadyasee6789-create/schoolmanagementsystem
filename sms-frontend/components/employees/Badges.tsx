export function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-md border px-2 text-[11px] font-bold ${
        isActive
          ? "border-emerald-400/30 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "border-red-400/30 bg-red-50 text-red-500 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-400"
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const isMember = source === "member";
  return (
    <span
      className={`inline-flex h-[22px] items-center rounded-md border px-2 text-[11px] font-bold ${
        isMember
          ? "border-indigo-400/30 bg-indigo-50 text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-400"
          : "border-emerald-400/30 bg-emerald-50 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-400"
      }`}
    >
      {isMember ? "Member" : "Employee"}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-md border border-blue-400/30 bg-blue-50 px-2 text-[11px] font-semibold capitalize text-blue-600 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-400">
      {role}
    </span>
  );
}
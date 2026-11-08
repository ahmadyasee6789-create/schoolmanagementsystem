"use client";

import { ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/app/store/authStore";
import SchoolixLogo from "@/components/brand/SchoolixLogo";

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

const LOGO_SIZE = 28;

export default function SidebarHeader({ collapsed, onToggle }: SidebarHeaderProps) {
  const orgName = useAuthStore((s) => s.user?.org_name);
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <div className="relative flex h-16 shrink-0 items-center justify-center overflow-hidden border-b border-slate-200 dark:border-white/10">
      {!collapsed && (
        <div className="flex min-w-0 flex-col items-center text-[18px] font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          <SchoolixLogo variant="full" size={LOGO_SIZE} />
          {orgName && (
            <span title={orgName} className="max-w-[140px] truncate text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
              {orgName}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        className={`flex shrink-0 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          collapsed
            ? "size-11"
            : "absolute right-4 size-8 border border-slate-200 text-slate-500 transition-colors hover:border-[#8B6DF2] hover:text-[#8B6DF2] dark:border-white/10 dark:text-slate-400"
        }`}
      >
        {collapsed ? <SchoolixLogo variant="icon" size={LOGO_SIZE} /> : <ChevronLeft size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

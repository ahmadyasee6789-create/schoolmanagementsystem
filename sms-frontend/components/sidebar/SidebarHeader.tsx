"use client";

import { ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/app/store/authStore";

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

function SchoolixMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 84 84" fill="none" aria-hidden="true">
      <rect x="0" y="0" width="60" height="60" rx="14" fill="#8B6DF2" />
      <rect x="24" y="24" width="60" height="60" rx="14" fill="#8B6DF2" opacity="0.35" />
    </svg>
  );
}

export default function SidebarHeader({ collapsed, onToggle }: SidebarHeaderProps) {
  const orgName = useAuthStore((s) => s.user?.org_name);

  return (
    <div
      className={`relative flex h-16 items-center border-b border-slate-200 dark:border-white/10 ${
        collapsed ? "justify-center px-0" : "px-4"
      }`}
    >
      {collapsed && <SchoolixMark size={28} />}

      {!collapsed && (
        <div className="absolute left-0 right-0 flex justify-center">
          <div className="flex min-w-0 items-center gap-2">
            <SchoolixMark size={22} />
            <div className="flex min-w-0 flex-col items-center gap-0.5">
              <span className="whitespace-nowrap text-[18px] font-extrabold tracking-tight">
                <span className="text-slate-900 dark:text-slate-50">School</span>
                <span className="text-[#8B6DF2]">ix</span>
              </span>

              {orgName && (
                <span
                  title={orgName}
                  className="max-w-[140px] truncate text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400"
                >
                  {orgName}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`relative z-10 ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all duration-300 hover:border-[#8B6DF2] hover:text-[#8B6DF2] dark:border-white/10 dark:text-slate-400 ${
          collapsed ? "rotate-180" : "rotate-0"
        }`}
      >
        <ChevronLeft size={16} />
      </button>
    </div>
  );
}
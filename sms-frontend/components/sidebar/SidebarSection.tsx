"use client";

import { ChevronDown } from "lucide-react";
import type { NavigationItem } from "@/constants/navigation";
import type { LucideIcon } from "lucide-react";
import SidebarSubItem from "./SidebarSubItem";

interface SidebarSectionProps {
  title: string;
  icon: LucideIcon;
  items: NavigationItem[];
  pathname: string;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export default function SidebarSection({
  title,
  icon: Icon,
  items,
  pathname,
  collapsed,
  isOpen,
  onToggle,
}: SidebarSectionProps) {
  const sectionActive = items.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  return (
    <div>
      {!collapsed && (
        <p className="px-4 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
          {title}
        </p>
      )}

      <button
        onClick={onToggle}
        className={`group flex w-full items-center rounded-lg transition-colors duration-200 ${
          collapsed ? "h-9 w-9 mx-auto justify-center" : "h-10 justify-between px-3 mx-1"
        } ${
          sectionActive
            ? "bg-[#8B6DF2]/10 text-slate-900 dark:bg-[#8B6DF2]/15 dark:text-slate-50"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:!bg-white/5 dark:hover:!text-slate-50"
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Icon
            size={17}
            className={`shrink-0 ${
              sectionActive
                ? "text-[#8B6DF2] dark:text-[#B8A6F7]"
                : "text-slate-500 dark:text-slate-400"
            }`}
          />
          {!collapsed && <span className="text-sm truncate">{title}</span>}
        </span>

        {!collapsed && (
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-500 dark:text-slate-500 transition-transform duration-200 ${
              isOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        )}
      </button>

      {!collapsed && isOpen && (
        <div className="mt-0.5 space-y-0.5 pb-1">
          {items.map((item) => (
            <SidebarSubItem
              key={item.href}
              item={item}
              isActive={pathname === item.href}
            />
          ))}
        </div>
      )}
    </div>
  );
}
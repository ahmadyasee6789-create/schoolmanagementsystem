import type { NavigationItem } from "@/constants/navigation";
import Link from "next/link";

interface SidebarItemProps {
  item: NavigationItem;
  isActive: boolean;
  collapsed: boolean;
}

export default function SidebarItem({ item, isActive, collapsed }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`
        group relative flex items-center rounded-lg transition-all duration-200
        ${collapsed ? "justify-center h-9 w-9 mx-auto" : "h-9 gap-2.5 px-3"}
        ${
          isActive
            ? "bg-indigo-50 text-[#8B6DF2] font-medium dark:bg-[#8B6DF2]/10"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:!bg-white/5 dark:hover:!text-slate-50"
        }
      `}
    >
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-[#8B6DF2]" />
      )}

      <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-105" />

      {!collapsed && <span className="text-sm">{item.label}</span>}
    </Link>
  );
}
import type { NavigationItem } from "@/constants/navigation";
import Link from "next/link";

interface SidebarSubItemProps {
  item: NavigationItem;
  isActive: boolean;
}

export default function SidebarSubItem({ item, isActive }: SidebarSubItemProps) {
  return (
    <Link
      href={item.href}
      className={`relative ml-6 mr-2 flex h-9 items-center rounded-md pl-4 text-sm transition-colors duration-200 ${
        isActive
          ? "bg-[#8B6DF2]/10 text-[#8B6DF2] font-medium dark:bg-[#8B6DF2]/10 dark:text-[#B8A6F7]"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:!bg-white/5 dark:hover:!text-slate-200"
      }`}
    >
      {isActive && (
        <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-[#8B6DF2]" />
      )}
      {item.label}
    </Link>
  );
}
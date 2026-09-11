"use client";

import { Menu, X } from "lucide-react";

interface TopbarMobileToggleProps {
  open: boolean;
  onToggle: () => void;
}

export default function TopbarMobileToggle({ open, onToggle }: TopbarMobileToggleProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={open ? "Close menu" : "Open menu"}
      className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border transition-colors duration-200 md:hidden ${
        open
          ? "border-[#8B6DF2] bg-[#8B6DF2]/15 text-gray-900 dark:text-slate-50 "
          : "border-white/10 text-gray-900 dark:text-slate-50 hover:bg-white/5 hover:border-[#8B6DF2]/40"
      }`}
    >
      {open ? <X size={20} /> : <Menu size={20} />}
    </button>
  );
}
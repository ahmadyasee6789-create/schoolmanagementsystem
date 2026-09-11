"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";

interface TopbarUserMenuProps {
  fullName?: string | null;
  email?: string | null;
  onLogout: () => void;
}

export default function TopbarUserMenu({ fullName, email, onLogout }: TopbarUserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = fullName
    ? fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "U";

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-[10px] border px-[10px] py-[6px] transition-colors duration-200 sm:gap-2 sm:px-3 ${
          open
            ? "border-[#8B6DF2] bg-[#8B6DF2]/15"
            : "border-white/10 hover:bg-white/5 hover:border-[#8B6DF2]/40"
        }`}
      >
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#8B6DF2] text-[0.72rem] font-bold text-white">
          {initials}
        </div>

        <span className="hidden max-w-[120px] truncate text-[0.82rem] font-medium text-slate-50 sm:block">
          {fullName ?? "User"}
        </span>

        <ChevronDown
          size={18}
          className={`hidden text-slate-400 transition-transform duration-200 sm:block ${
            open ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[200px] overflow-hidden rounded-xl border border-white/10 bg-[#161B26] shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
          <div className="px-4 py-3">
            <p className="text-[0.82rem] font-semibold text-slate-50">{fullName ?? "User"}</p>
            {email && <p className="mt-0.5 text-[0.72rem] text-slate-400">{email}</p>}
          </div>

          <div className="border-t border-white/10" />

          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="mx-1 flex w-[calc(100%-8px)] items-center gap-3 rounded-lg px-3 py-2 text-left text-[0.84rem] text-red-400 transition-colors duration-200 hover:bg-red-400/10"
            >
              <LogOut size={17} />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
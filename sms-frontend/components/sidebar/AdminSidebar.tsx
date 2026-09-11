"use client";

import { usePathname } from "next/navigation";
import SidebarHeader from "./SidebarHeader";
import SidebarNav from "./SidebarNav";
import SidebarFooter from "./SidebarFooter";

const SIDEBAR_WIDTH = 272;
const COLLAPSED_WIDTH = 64;

interface AdminSidebarProps {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  mobileOpen?: boolean;
  setMobileOpen?: (val: boolean) => void;
}

export default function AdminSidebar({
  collapsed,
  setCollapsed,
  mobileOpen = false,
  setMobileOpen,
}: AdminSidebarProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    // wire up to your auth store / router
  };

  const width = collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen?.(false)}
        />
      )}

      <div
        className="hidden md:flex fixed left-0 top-0 h-screen flex-col
          border-r border-slate-200 bg-white text-slate-900
          dark:border-white/10 dark:bg-[#0D1117] dark:text-slate-100
          z-30"
        style={{ width, transition: "width 300ms cubic-bezier(0.4,0,0.2,1)" }}
      >
        <SidebarHeader collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <SidebarNav pathname={pathname} collapsed={collapsed} />
        <SidebarFooter collapsed={collapsed} onLogout={handleLogout} />
      </div>

      <div
        className="md:hidden fixed left-0 top-0 h-screen flex flex-col
          border-r border-slate-200 bg-white text-slate-900
          dark:border-white/10 dark:bg-[#0D1117] dark:text-slate-100
          z-50"
        style={{
          width: SIDEBAR_WIDTH,
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 300ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <SidebarHeader collapsed={false} onToggle={() => setMobileOpen?.(false)} />
        <SidebarNav pathname="" collapsed={false} />
        <SidebarFooter collapsed={false} onLogout={handleLogout} />
      </div>
    </>
  );
}
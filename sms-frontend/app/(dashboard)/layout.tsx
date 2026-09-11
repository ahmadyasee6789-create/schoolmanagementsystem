"use client";

import { useState } from "react";
import AdminSidebar from "@/components/sidebar/AdminSidebar";
import Topbar from "@/components/topbar/Topbar";

const SIDEBAR_WIDTH = 272;
const COLLAPSED_WIDTH = 64;
const TOPBAR_HEIGHT = 64;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0D1117]">
      <Topbar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} collapsed={collapsed} />

      <AdminSidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

     <main
  className="box-border bg-white transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] dark:bg-[#0D1117]
    ml-0 md:ml-[var(--sidebar-offset)]"
  style={{
    ["--sidebar-offset" as string]: `${collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH}px`,
    marginTop: TOPBAR_HEIGHT,
    minHeight: `calc(100vh - ${TOPBAR_HEIGHT}px)`,
    backgroundImage:
      "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245,158,11,0.04) 0%, transparent 60%)",
  }}
>
        {children}
      </main>
    </div>
  );
}
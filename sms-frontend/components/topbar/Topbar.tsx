"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/authStore";
import TopbarMobileToggle from "./TopbarMobileToggle";
import TopbarGreeting from "./TopbarGreeting";
import TopbarUserMenu from "./TopbarUserMenu";
import ThemeToggle from "@/components/topbar/ThemeToggle";

const SIDEBAR_WIDTH = 272;
const COLLAPSED_WIDTH = 64;
const EASE = "300ms cubic-bezier(0.4, 0, 0.2, 1)";

interface TopbarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (val: boolean) => void;
  collapsed?: boolean;
}

export default function Topbar({
  mobileOpen = false,
  setMobileOpen,
  collapsed = false,
}: TopbarProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push("/signin");
  };

  return (
   <header
  className="fixed top-0 right-0 z-30 flex h-16 items-center gap-2
    border-b border-slate-200 bg-white
    px-3 shadow-[0_4px_24px_rgba(0,0,0,0.04)]
    sm:gap-4 sm:px-6
    left-0 md:left-[var(--sidebar-offset)]
    dark:border-white/10 dark:bg-[#0D1117] dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]"
  style={{
    ["--sidebar-offset" as string]: `${collapsed ? COLLAPSED_WIDTH : SIDEBAR_WIDTH}px`,
    transition: `left ${EASE}`,
  }}
>
      <TopbarMobileToggle
        open={mobileOpen}
        onToggle={() => setMobileOpen?.(!mobileOpen)}
      />

      <TopbarGreeting fullName={user?.full_name} />

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ThemeToggle />

        <TopbarUserMenu
          fullName={user?.full_name}
          email={user?.email}
          onLogout={handleLogout}
        />
      </div>
    </header>
  );
}
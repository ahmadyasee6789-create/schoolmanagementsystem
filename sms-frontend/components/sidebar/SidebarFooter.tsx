import { LogOut } from "lucide-react";

interface SidebarFooterProps {
  collapsed: boolean;
  onLogout: () => void;
}

export default function SidebarFooter({ collapsed, onLogout }: SidebarFooterProps) {
  return (
    <footer className="border-t border-white/10 pt-3 pb-3">
      <button
        onClick={onLogout}
        className={`flex items-center text-sm text-red-400 transition-colors hover:bg-white/5 ${
          collapsed ? "h-11 w-11 justify-center mx-auto rounded-lg" : "gap-3 px-4 py-2.5 w-full"
        }`}
      >
        <LogOut className="h-4 w-4" />
        {!collapsed && <span>Logout</span>}
      </button>
    </footer>
  );
}
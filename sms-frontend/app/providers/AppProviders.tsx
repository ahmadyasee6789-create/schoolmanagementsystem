"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const PrivateAppProviders = dynamic(() => import("./PrivateAppProviders"));

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The public site renders immediately, without loading school data or theme state.
  if (pathname === "/") return <>{children}</>;
  return <PrivateAppProviders>{children}</PrivateAppProviders>;
}

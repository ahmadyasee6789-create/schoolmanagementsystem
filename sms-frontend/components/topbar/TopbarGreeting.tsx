"use client";

import { useGreeting } from "./useGreeting";

interface TopbarGreetingProps {
  fullName?: string | null;
}

export default function TopbarGreeting({ fullName }: TopbarGreetingProps) {
  const greeting = useGreeting();
  const firstName = fullName?.split(" ")[0] ?? "there";

  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[0.95rem] font-semibold text-slate-900 dark:text-slate-50 sm:text-[1.05rem]">
        {greeting}
        <span className="text-accent">, {firstName}</span>
      </p>
    </div>
  );
}
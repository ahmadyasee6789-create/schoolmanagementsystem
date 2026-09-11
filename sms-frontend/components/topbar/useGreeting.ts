"use client";

import { useEffect, useState } from "react";

function getGreeting(date: Date) {
  const hour = date.getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function useGreeting() {
  const [greeting, setGreeting] = useState(() => getGreeting(new Date()));

  useEffect(() => {
    const tick = () => setGreeting(getGreeting(new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return greeting;
}
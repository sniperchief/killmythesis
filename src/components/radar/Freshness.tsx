"use client";

import { useSyncExternalStore } from "react";
import { pad2 } from "@/lib/format";

const TICK_MS = 30_000;
const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
};

/** Current time rounded to 30s; null during SSR so server and client markup match. */
function useClock(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => null,
  );
}

export function relativeAge(fromIso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(fromIso)) / 60_000);
  if (!Number.isFinite(minutes)) return "unknown";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ago`;
}

/** "2 min ago · 11:42", in the viewer's local time. Never claims to be real-time. */
export function Freshness({ iso }: { iso: string }) {
  const now = useClock();
  if (now === null) return <span>—</span>;
  const d = new Date(iso);
  return (
    <time dateTime={iso} title={d.toString()}>
      {relativeAge(iso, now)} · {pad2(d.getHours())}:{pad2(d.getMinutes())}
    </time>
  );
}

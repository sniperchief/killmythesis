"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DATA_MODE } from "@/lib/config";

const NAV = [
  { href: "/thesis", label: "Kill my thesis", isActive: (p: string) => p.startsWith("/thesis") },
  { href: "/radar", label: "Narrative radar", isActive: (p: string) => p.startsWith("/radar") },
  { href: "/#how-it-works", label: "How it works", isActive: () => false },
  {
    href: "/history",
    label: "History",
    isActive: (p: string) => p.startsWith("/history") || p.startsWith("/research"),
  },
];

/**
 * Floating pill navigation. The rounded pill is a deliberate exception to the
 * square research-instrument styling used everywhere else.
 */
export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const live = DATA_MODE === "live";
  const status = live ? "Live · Bitget market data" : "UI preview · sample data";

  return (
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
      <div className="pointer-events-auto mx-auto flex max-w-[1120px] items-center gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-paper shadow-[0_12px_32px_-14px_rgba(12,12,13,0.55)] sm:pl-6">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex shrink-0 items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-paper"
        >
          <span aria-hidden className="h-2.5 w-2.5 bg-accent" />
          killmythesis
        </Link>

        <nav aria-label="Primary" className="mx-auto hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] decoration-accent decoration-2 underline-offset-[6px] transition-colors hover:underline lg:px-4 ${
                  active ? "text-paper" : "text-paper/60 hover:text-paper"
                }`}
              >
                {active && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <span
            title={status}
            className={`mr-1 hidden h-2 w-2 rounded-full sm:block ${live ? "bg-support" : "bg-caution"}`}
          >
            <span className="sr-only">{status}</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="rounded-full px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-paper/80 hover:text-paper md:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
          <Link
            href="/thesis"
            onClick={() => setOpen(false)}
            className="whitespace-nowrap rounded-full bg-accent px-4 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110 sm:px-5"
          >
            Kill my thesis →
          </Link>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="pointer-events-auto mx-auto mt-2 max-w-[1120px] rounded-3xl bg-ink p-2 text-paper shadow-[0_12px_32px_-14px_rgba(12,12,13,0.55)] md:hidden"
        >
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-2xl px-4 py-3 font-mono text-[12px] font-medium uppercase tracking-[0.12em] decoration-accent decoration-2 underline-offset-[6px] hover:underline ${
                  active ? "bg-paper/10 text-paper" : "text-paper/70 hover:bg-paper/5 hover:text-paper"
                }`}
              >
                {active && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
                {item.label}
              </Link>
            );
          })}
          <div className="flex items-center gap-2 px-4 pb-2 pt-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-paper/50">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-support" : "bg-caution"}`} />
            {status}
          </div>
        </nav>
      )}
    </header>
  );
}

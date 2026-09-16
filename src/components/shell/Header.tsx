"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DATA_MODE } from "@/lib/config";
import { Logo } from "./Logo";

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

/** In the full-screen phone menu, "Kill my thesis" is the pinned button, so the list holds the rest. */
const MOBILE_NAV = NAV.filter((item) => item.href !== "/thesis");

const SAMPLE_NOTE = "UI preview · sample data";

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 7h18M3 12h18M3 17h18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

/**
 * Tablet and desktop: floating pill navigation (a deliberate exception to the square styling).
 * Phones: a sticky bar with a hamburger that opens a full-screen menu.
 */
export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const live = DATA_MODE === "live";
  const close = () => setOpen(false);

  // While the phone menu is open: lock page scroll, close on Escape, and close if the viewport grows to tablet width.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const tablet = window.matchMedia("(min-width: 768px)");
    const onResize = () => {
      if (tablet.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    tablet.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      tablet.removeEventListener("change", onResize);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 md:pointer-events-none md:px-6 md:pt-4">
      {/* Phones: sticky bar */}
      <div className="flex items-center justify-between border-b border-paper/10 bg-ink px-4 py-2.5 text-paper md:hidden">
        <Link href="/" onClick={close} className="flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight">
          <Logo />
          killmythesis
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="-mr-2 flex h-11 w-11 items-center justify-center text-paper"
        >
          <MenuIcon />
        </button>
      </div>

      {/* Tablet and desktop: floating pill */}
      <div className="pointer-events-auto mx-auto hidden max-w-[1120px] items-center gap-3 rounded-full bg-ink py-2 pl-6 pr-2 text-paper shadow-[0_12px_32px_-14px_rgba(12,12,13,0.55)] md:flex">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-paper">
          <Logo />
          killmythesis
        </Link>

        <nav aria-label="Primary" className="mx-auto flex items-center gap-1">
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

        <div className="flex items-center gap-2">
          {!live && (
            <span title={SAMPLE_NOTE} className="mr-1 h-2 w-2 rounded-full bg-caution">
              <span className="sr-only">{SAMPLE_NOTE}</span>
            </span>
          )}
          <Link
            href="/thesis"
            className="whitespace-nowrap rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            Kill my thesis →
          </Link>
        </div>
      </div>

      {/* Phones: full-screen menu */}
      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="menu-fade fixed inset-0 z-50 flex flex-col bg-ink text-paper md:hidden"
        >
          <div className="flex items-center justify-between border-b border-paper/10 px-4 py-2.5">
            <Link href="/" onClick={close} className="flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight">
              <Logo />
              killmythesis
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              autoFocus
              className="-mr-2 flex h-11 w-11 items-center justify-center text-paper"
            >
              <CloseIcon />
            </button>
          </div>

          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-4 pt-4">
            <ol>
              {MOBILE_NAV.map((item, i) => {
                const active = item.isActive(pathname);
                return (
                  <li key={item.href} className="border-b border-paper/10">
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className="flex items-center justify-between gap-4 py-5"
                    >
                      <span className="flex items-center gap-3 font-display text-[32px] font-bold leading-none tracking-[-0.02em]">
                        {active && <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />}
                        {item.label}
                      </span>
                      <span className="font-mono text-[12px] text-paper/40">{String(i + 1).padStart(2, "0")}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
            {!live && (
              <div className="mt-6 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-paper/50">
                <span className="h-1.5 w-1.5 rounded-full bg-caution" />
                {SAMPLE_NOTE}
              </div>
            )}
          </nav>

          <div className="border-t border-paper/10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <Link
              href="/thesis"
              onClick={close}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-4 text-[16px] font-semibold text-white transition hover:brightness-110"
            >
              Kill my thesis →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

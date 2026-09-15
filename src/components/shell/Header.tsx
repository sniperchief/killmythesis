"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGE } from "@/components/ui/styles";
import { DATA_MODE } from "@/lib/config";

const NAV = [
  { href: "/", label: "Kill my thesis", isActive: (p: string) => p === "/" },
  { href: "/radar", label: "Narrative radar", isActive: (p: string) => p.startsWith("/radar") },
  {
    href: "/history",
    label: "Research history",
    isActive: (p: string) => p.startsWith("/history") || p.startsWith("/research"),
  },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-sm">
      <div className={`${PAGE} flex flex-wrap items-center gap-x-8`}>
        <Link href="/" className="flex items-center gap-2 py-3.5 font-mono text-[15px] font-semibold tracking-tight">
          <span aria-hidden className="h-2.5 w-2.5 bg-accent" />
          killmythesis
        </Link>

        <nav aria-label="Primary" className="order-3 -mx-2 flex w-full overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-2 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] transition-colors sm:px-3 sm:py-[17px] ${
                  active ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <DataModeIndicator />
      </div>
    </header>
  );
}

function DataModeIndicator() {
  const live = DATA_MODE === "live";
  return (
    <div className="ml-auto flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-support" : "bg-caution"}`} />
      {live ? "Live · Bitget market intelligence" : "UI preview · sample data"}
    </div>
  );
}

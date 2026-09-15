import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE, monoMeta } from "@/components/ui/styles";
import { DATA_MODE } from "@/lib/config";

const PRODUCT = [
  { href: "/thesis", label: "Kill my thesis" },
  { href: "/radar", label: "Narrative radar" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/history", label: "Research history" },
];

/** Public pages for the providers the research actually uses. */
const SOURCES = [
  { href: "https://www.bitget.com", label: "Bitget Market API" },
  { href: "https://alternative.me/crypto/fear-and-greed-index/", label: "alternative.me" },
  { href: "https://defillama.com", label: "DeFiLlama" },
  { href: "https://www.coingecko.com", label: "CoinGecko" },
];

const PRINCIPLES = ["No trade execution", "No exchange keys", "Rules score, not the AI", "Missing data is never filled in"];

const REPO = "https://github.com/sniperchief/killmythesis";

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className={`text-paper/45 ${monoMeta}`}>{title}</div>
      <ul className="mt-4 space-y-2.5 text-[14px]">{children}</ul>
    </div>
  );
}

const linkClass =
  "text-paper/80 decoration-accent decoration-2 underline-offset-[5px] transition-colors hover:text-paper hover:underline";

export function Footer() {
  const live = DATA_MODE === "live";

  return (
    <footer className="bg-ink text-paper">
      <div className={`${PAGE} pt-14 lg:pt-16`}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight">
              <span aria-hidden className="h-2.5 w-2.5 bg-accent" />
              killmythesis
            </Link>
            <p className="mt-4 max-w-xs text-[14.5px] leading-relaxed text-paper/65">
              An AI research desk that stress-tests your trade idea before the market does.
            </p>
            <div className={`mt-5 flex items-center gap-2 text-paper/55 ${monoMeta}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-support" : "bg-caution"}`} />
              {live ? "Live · Bitget market data" : "UI preview · sample data"}
            </div>
          </div>

          <div className="lg:col-span-2">
            <Column title="Product">
              {PRODUCT.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={linkClass}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </Column>
          </div>

          <div className="lg:col-span-3">
            <Column title="Data sources">
              {SOURCES.map((item) => (
                <li key={item.href}>
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {item.label} <span aria-hidden className="text-paper/40">↗</span>
                  </a>
                </li>
              ))}
            </Column>
          </div>

          <div className="lg:col-span-3">
            <Column title="Principles">
              {PRINCIPLES.map((item) => (
                <li key={item} className="flex items-baseline gap-2 text-paper/80">
                  <span aria-hidden className="font-mono text-[12px] text-accent">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </Column>
          </div>
        </div>

        <div
          aria-hidden
          className="mt-14 select-none overflow-hidden whitespace-nowrap font-display text-[17vw] font-bold leading-[0.8] tracking-[-0.05em] text-paper/[0.06] lg:text-[190px]"
        >
          killmythesis
        </div>

        <div
          className={`flex flex-col gap-3 border-t border-paper/10 py-6 text-paper/50 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${monoMeta}`}
        >
          <span>Research tool · not financial advice · you decide</span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Built for the Bitget AI × Crypto Hackathon</span>
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-paper/70 hover:text-paper">
              GitHub ↗
            </a>
            <span>© 2026 KillMyThesis</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

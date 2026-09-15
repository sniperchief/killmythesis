/**
 * KillMyThesis mark: a claim, struck out.
 *
 * The square takes the surrounding text colour (black on light pages, white inside
 * the dark header pill); the accent bar cuts across it and past both edges, echoing
 * the struck-through word in the hero headline.
 */
export function Logo({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 overflow-visible ${className}`}>
      <rect x="4" y="4" width="16" height="16" fill="currentColor" />
      <path d="M1 12h22" stroke="var(--color-accent)" strokeWidth="3.5" strokeLinecap="square" />
    </svg>
  );
}

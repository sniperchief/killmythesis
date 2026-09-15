/** Inline trend line of a normalized series (1 = start). Drawn from real data only; no series, no line. */
export function Sparkline({
  values,
  width = 96,
  height = 24,
  className = "",
  label = "30-day median basket performance",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  label?: string;
}) {
  if (values.length < 2) return <span className="font-mono text-[11px] text-faint">—</span>;
  const pad = 2;
  const min = Math.min(...values, 1);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - 2 * pad);
  const last = values[values.length - 1];
  const change = (last - 1) * 100;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)}%`}
      className={`block h-6 w-full max-w-[96px] overflow-visible ${className}`}
    >
      <line x1={pad} x2={width - pad} y1={y(1)} y2={y(1)} className="stroke-line-strong" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      <polyline
        points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={last >= 1 ? "stroke-support" : "stroke-challenge"}
      />
    </svg>
  );
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${date} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatShortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const formatUnit = (n: number) => n.toFixed(2);

/** "A2" → "02" using the assumption's position in the thesis. */
export function assumptionNumber(ids: string[], id: string) {
  const index = ids.indexOf(id);
  return index === -1 ? id : pad2(index + 1);
}

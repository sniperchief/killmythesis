import { describe, expect, it } from "vitest";
import { readFedFunds, readHeadlines, toIsoTimestamp } from "./signal-readers";

describe("Signal payload readers", () => {
  it("reads headlines from feed lists, dedupes and sorts newest first", () => {
    const headlines = readHeadlines([
      { feed: "coindesk", error: "", items: [{ title: "Solana DEX volume climbs", link: "https://x", published: "2026-09-14T10:00:00Z" }] },
      { feed: "decrypt", error: "", items: [{ title: "Solana DEX volume climbs" }, { title: "SOL ETF filing", published: "2026-09-15T08:00:00Z" }] },
    ]);
    expect(headlines.map((h) => [h.outlet, h.title])).toEqual([
      ["Decrypt", "SOL ETF filing"],
      ["CoinDesk", "Solana DEX volume climbs"],
    ]);
  });

  it("returns null for the observed all-null fed funds payload", () => {
    expect(readFedFunds({ effective_fed_funds: null, target_upper: null, target_lower: null, note: "…" })).toBeNull();
  });

  it("parses unix seconds, unix ms and date strings", () => {
    expect(toIsoTimestamp(1789430400)).toBe("2026-09-15T00:00:00.000Z");
    expect(toIsoTimestamp("1789430400000")).toBe("2026-09-15T00:00:00.000Z");
    expect(toIsoTimestamp("not a date")).toBeNull();
  });
});

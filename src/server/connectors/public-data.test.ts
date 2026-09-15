import { describe, expect, it } from "vitest";
import { createPublicData } from "./public-data";
import type { FetchLike } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const withResponse = (response: () => Response | Promise<Response>, timeoutMs = 1000) =>
  createPublicData(async () => response(), timeoutMs);

describe("public data connector", () => {
  it("parses Fear & Greed readings newest first with millisecond timestamps", async () => {
    const data = withResponse(() =>
      json({
        name: "Fear and Greed Index",
        data: [
          { value: "63", value_classification: "Greed", timestamp: "1788307200" },
          { value: "69", value_classification: "Greed", timestamp: "1789430400", time_until_update: "53554" },
        ],
        metadata: { error: null },
      }),
    );
    const result = await data.fearGreed(14);
    expect(result).toMatchObject({
      ok: true,
      data: [
        { value: 69, label: "Greed", timestamp: 1789430400000 },
        { value: 63, label: "Greed", timestamp: 1788307200000 },
      ],
    });
  });

  it("sorts chains by TVL and totals USD stablecoin supply", async () => {
    const chains = await withResponse(() =>
      json([
        { name: "Moonbeam", tvl: 78092, tokenSymbol: "GLMR", gecko_id: "moonbeam" },
        { name: "Solana", tvl: 5865624201, tokenSymbol: "SOL", gecko_id: "solana" },
        { name: "Base", tvl: 5590068496, tokenSymbol: null, gecko_id: null },
      ]),
    ).chains();
    expect(chains.ok && chains.data.map((c) => c.name)).toEqual(["Solana", "Base", "Moonbeam"]);

    const stables = await withResponse(() =>
      json({
        peggedAssets: [
          { circulating: { peggedUSD: 200 }, circulatingPrevWeek: { peggedUSD: 190 }, circulatingPrevMonth: { peggedUSD: 180 } },
          { circulating: { peggedEUR: 50 }, circulatingPrevWeek: null, circulatingPrevMonth: {} },
        ],
        chains: [],
      }),
    ).stablecoins();
    expect(stables).toMatchObject({ ok: true, data: { totalUsd: 200, prevWeekUsd: 190, prevMonthUsd: 180 } });
  });

  it("reports an unknown chain (HTML 404) as not listed and a 500 as http", async () => {
    const missing = withResponse(() => new Response("<html><title>404 Not Found</title></html>", { status: 404 }));
    expect(await missing.chainTvlHistory("NotAChainXYZ")).toMatchObject({ ok: false, reason: "not_listed" });
    const broken = withResponse(() => new Response("Internal server error", { status: 500 }));
    expect(await broken.chainDexVolume("notachainxyz")).toMatchObject({ ok: false, reason: "http" });
  });

  it("reports malformed, empty and invalid payloads", async () => {
    expect(await withResponse(() => new Response("not json")).globalMarket()).toMatchObject({ ok: false, reason: "malformed" });
    expect(await withResponse(() => json([])).chains()).toMatchObject({ ok: false, reason: "empty" });
    expect(await withResponse(() => json({ data: [{ value: "abc", value_classification: "Greed", timestamp: "1" }] })).fearGreed(1)).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(await withResponse(() => json({ totalDataChart: [], total7d: null, total30d: null })).chainDexVolume("solana")).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });

  it("times out a hanging provider", async () => {
    const hanging: FetchLike = (_input, init) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
      );
    expect(await createPublicData(hanging, 30).fearGreed(14)).toMatchObject({ ok: false, reason: "timeout" });
  });
});

import { describe, expect, it } from "vitest";
import { createBitgetRest } from "./bitget-rest";
import type { FetchLike } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const restWith = (handler: FetchLike, timeoutMs = 1000) => createBitgetRest(handler, timeoutMs);

describe("Bitget REST connector", () => {
  it("parses and sorts candles", async () => {
    const rest = restWith(async () =>
      json({
        code: "00000",
        msg: "success",
        data: [
          ["1789401600000", "101.98", "104.81", "101.87", "102.55", "209500.37", "21633637.11", "21633637.11"],
          ["1789315200000", "100.24", "102.35", "99", "101.98", "458767.56", "46357177.94", "46357177.94"],
        ],
      }),
    );
    const result = await rest.spotCandles("SOLUSDT", "1day", 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((c) => c.ts)).toEqual([1789315200000, 1789401600000]);
      expect(result.data[1].close).toBe(102.55);
    }
  });

  it("uses the spot `1day` granularity in the request", async () => {
    let url = "";
    const rest = restWith(async (input) => {
      url = input;
      return json({ code: "00000", data: [["1", "1", "1", "1", "1", "1", "1", "1"]] });
    });
    await rest.spotCandles("SOLUSDT", "1day", 100);
    expect(url).toContain("granularity=1day");
  });

  it("times out a hanging request", async () => {
    const rest = restWith(
      (_input, init) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
        ),
      30,
    );
    expect(await rest.spotTicker("SOLUSDT")).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("reports a non-JSON 200 body as malformed and a 5xx page as http", async () => {
    expect(await restWith(async () => new Response("<html>", { status: 200 })).spotTicker("SOLUSDT")).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(await restWith(async () => new Response("<html>", { status: 503 })).spotTicker("SOLUSDT")).toMatchObject({
      ok: false,
      reason: "http",
    });
  });

  it("reports data that fails validation as malformed", async () => {
    const wrongShape = restWith(async () => json({ code: "00000", data: [{ foo: 1 }] }));
    expect(await wrongShape.spotTicker("SOLUSDT")).toMatchObject({ ok: false, reason: "malformed" });

    const nonNumeric = restWith(async () =>
      json({
        code: "00000",
        data: [{ symbol: "SOLUSDT", lastPr: "abc", high24h: "1", low24h: "1", change24h: "0", usdtVolume: "1", ts: "1" }],
      }),
    );
    expect(await nonNumeric.spotTicker("SOLUSDT")).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("reports an unlisted symbol and null data", async () => {
    const unlisted = restWith(async () => json({ code: "40034", msg: "Parameter NOTACOINUSDT does not exist", data: null }, 400));
    expect(await unlisted.spotTicker("NOTACOINUSDT")).toMatchObject({ ok: false, reason: "not_listed" });

    const empty = restWith(async () => json({ code: "00000", data: null }));
    expect(await empty.fundingHistory("SOLUSDT", 21)).toMatchObject({ ok: false, reason: "empty" });

    const emptyList = restWith(async () => json({ code: "00000", data: [] }));
    expect(await emptyList.spotCandles("SOLUSDT", "1day", 10)).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("reports network errors", async () => {
    const rest = restWith(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await rest.openInterest("SOLUSDT")).toMatchObject({ ok: false, reason: "network" });
  });
});

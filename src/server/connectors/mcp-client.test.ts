import { describe, expect, it } from "vitest";
import { SignalMcpClient, parseRpcMessages, unusableReason } from "./mcp-client";
import type { FetchLike } from "./types";

const sse = (message: object) => `: ping - 2026-09-15\n\nevent: message\ndata: ${JSON.stringify(message)}\n\n`;

interface RpcBody {
  id?: number;
  method: string;
}

type ToolHandler = (id: number, init: RequestInit | undefined, attempt: number) => Response | Promise<Response>;

function fakeServer(onTool: ToolHandler) {
  const methods: string[] = [];
  let toolAttempts = 0;
  const fetchImpl: FetchLike = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as RpcBody;
    methods.push(body.method);
    if (body.method === "initialize") {
      return new Response(sse({ jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "market-data-mcp" } } }), {
        status: 200,
        headers: { "mcp-session-id": "session-1", "content-type": "text/event-stream" },
      });
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return onTool(body.id ?? 0, init, toolAttempts++);
  };
  return { fetchImpl, methods };
}

const toolText = (id: number, text: string, isError = false) =>
  new Response(sse({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError } }), { status: 200 });

const clientFor = (onTool: ToolHandler, callTimeoutMs = 1000) =>
  new SignalMcpClient({ fetchImpl: fakeServer(onTool).fetchImpl, callTimeoutMs, initTimeoutMs: 1000 });

describe("SignalMcpClient", () => {
  it("returns data when the tool responds with usable values", async () => {
    const client = clientFor((id) => toolText(id, JSON.stringify({ symbol: "SOL/USDT", rsi: 57.61 })));
    const result = await client.callTool("technical_analysis", { action: "rsi" });
    expect(result).toMatchObject({ ok: true, data: { rsi: 57.61 } });
  });

  it("times out a hanging call instead of blocking", async () => {
    const client = clientFor(
      (_id, init) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
        ),
      30,
    );
    const result = await client.callTool("news_feed", { action: "latest" });
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
  });

  it.each([
    ["empty error object", `{"error": ""}`],
    ["provider-specific empty error", `{"alt_me_error": ""}`],
    ["error plus metadata url", `{"error": "", "url": "https://api.llama.fi/v2/chains"}`],
    ["null values with a note", `{"effective_fed_funds": null, "target_upper": null, "note": "FOMC sets the target range"}`],
    [
      "derived values from failed inputs",
      `{"yield_curve": {"t3m": {"error": ""}, "t1y": {"error": ""}, "t2y": {"error": ""}, "t5y": {"error": ""}, "t10y": {"error": ""}, "t30y": {"error": ""}}, "spread_10y2y": 0.0, "inverted": false}`,
    ],
    ["feeds with empty items", `[{"feed": "coindesk", "error": "", "items": []}, {"feed": "decrypt", "error": "", "items": []}]`],
    ["error text with isError false", "Error executing tool crypto_market: ConnectTimeout('')"],
  ])("treats %s as a failure despite isError false", async (_label, text) => {
    const client = clientFor((id) => toolText(id, text));
    const result = await client.callTool("any_tool", {});
    expect(result.ok).toBe(false);
  });

  it("treats an empty content array as empty", async () => {
    const client = clientFor(
      (id) => new Response(sse({ jsonrpc: "2.0", id, result: { content: [], isError: false } }), { status: 200 }),
    );
    expect(await client.callTool("any_tool", {})).toMatchObject({ ok: false, reason: "empty" });
  });

  it("reports isError results as upstream errors", async () => {
    const client = clientFor((id) => toolText(id, "Error executing tool global_assets: ", true));
    expect(await client.callTool("global_assets", {})).toMatchObject({ ok: false, reason: "upstream_error" });
  });

  it("reports a non-SSE, non-JSON body as malformed", async () => {
    const client = clientFor(() => new Response("<html>gateway</html>", { status: 200 }));
    expect(await client.callTool("any_tool", {})).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("reports a result that doesn't match the MCP schema as malformed", async () => {
    const client = clientFor((id) => new Response(sse({ jsonrpc: "2.0", id, result: { unexpected: true } }), { status: 200 }));
    expect(await client.callTool("any_tool", {})).toMatchObject({ ok: false, reason: "malformed" });
  });

  it("reports JSON-RPC errors and HTTP errors", async () => {
    const rpc = clientFor((id) => new Response(sse({ jsonrpc: "2.0", id, error: { code: -32602, message: "bad params" } })));
    expect(await rpc.callTool("any_tool", {})).toMatchObject({ ok: false, reason: "upstream_error" });
    const http = clientFor(() => new Response("oops", { status: 502 }));
    expect(await http.callTool("any_tool", {})).toMatchObject({ ok: false, reason: "http" });
  });

  it("re-initializes once when the session has expired", async () => {
    const server = fakeServer((id, _init, attempt) =>
      attempt === 0 ? new Response("", { status: 404 }) : toolText(id, JSON.stringify({ value: 42, value_classification: "Fear" })),
    );
    const client = new SignalMcpClient({ fetchImpl: server.fetchImpl });
    const result = await client.callTool("sentiment_index", { action: "current" });
    expect(result.ok).toBe(true);
    expect(server.methods.filter((m) => m === "initialize")).toHaveLength(2);
  });

  it("reports a failed session handshake without throwing", async () => {
    const client = new SignalMcpClient({ fetchImpl: async () => new Response("down", { status: 503 }) });
    expect(await client.callTool("any_tool", {})).toMatchObject({ ok: false, reason: "http" });
  });
});

describe("parseRpcMessages", () => {
  it("ignores SSE ping comments and parses data events", () => {
    const body = `: ping - a\n\n: ping - b\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{}}\n\n`;
    expect(parseRpcMessages(body)).toEqual([{ jsonrpc: "2.0", id: 3, result: {} }]);
  });
});

describe("unusableReason", () => {
  it("accepts payloads that carry real values", () => {
    expect(unusableReason({ symbol: "SOL/USDT", last: 102.55 })).toBeNull();
    expect(unusableReason([{ feed: "coindesk", error: "", items: [{ title: "Solana news" }] }])).toBeNull();
  });
});

/**
 * Minimal MCP Streamable HTTP client for the public Bitget Signal server.
 *
 * Protocol (verified against the live server 2026-09-15):
 *   POST initialize            → `mcp-session-id` response header, SSE `data:` JSON-RPC result
 *   POST notifications/initialized (with session header)
 *   POST tools/call            → SSE body: `: ping` comments, then `data: {jsonrpc result}`
 *
 * Reliability rules: HTTP 200 and `isError: false` do NOT mean success. The server
 * has returned `{"error": ""}`, `{"alt_me_error": ""}`, feed lists with empty
 * `items`, and "Error executing tool …" strings, all with isError false. Every
 * such payload is converted into a structured failure.
 */
import { z } from "zod";
import { TIMEOUTS, withTimeout } from "@/server/research/timeouts";
import { records } from "./signal-readers";
import {
  ConnectorError,
  failure,
  failureFromError,
  success,
  truncate,
  type ConnectorResult,
  type FetchLike,
} from "./types";

export const SIGNAL_MCP_URL = "https://datahub.noxiaohao.com/mcp";
const PROTOCOL_VERSION = "2025-03-26";

const RpcResponse = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.number(), z.string()]).nullish(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
type RpcResponse = z.infer<typeof RpcResponse>;

const ToolCallResult = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  isError: z.boolean().optional(),
});

/** Extracts JSON-RPC messages from an SSE body (`data:` events) or a plain JSON body. */
export function parseRpcMessages(body: string): unknown[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json: unknown = JSON.parse(trimmed);
      return Array.isArray(json) ? json : [json];
    } catch {
      return [];
    }
  }
  const messages: unknown[] = [];
  for (const event of trimmed.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // A malformed event is ignored; a missing response is reported by the caller.
    }
  }
  return messages;
}

function findResponse(messages: unknown[], id: number): RpcResponse | null {
  for (const message of messages) {
    const parsed = RpcResponse.safeParse(message);
    if (parsed.success && parsed.data.id === id) return parsed.data;
  }
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isRecord(v)) return Object.keys(v).length === 0;
  return false;
}

const ERROR_KEY = /(^|_)error$/i;

/** True when a value holds actual data: a finite number or a collection containing data. Flags and labels don't count. */
function carriesData(v: unknown): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.some(carriesData) || v.some((x) => typeof x === "string" && x.trim() !== "");
  if (isRecord(v)) return Object.entries(v).some(([k, x]) => !ERROR_KEY.test(k) && carriesData(x));
  return false;
}

/**
 * Returns why a tool payload is unusable, or null when it carries real data.
 *
 * Observed failure shapes (all with isError false):
 *   {"error": ""}                         {"alt_me_error": ""}
 *   {"error": "", "url": "https://…"}     metadata only
 *   {"effective_fed_funds": null, …, "note": "…"}   nulls plus a note string
 *   [{"feed": "coindesk", "error": "", "items": []}, …]
 * Descriptive strings (url, note, symbol) never count as data on their own.
 * Tool-specific validators run afterwards and are stricter.
 */
export function unusableReason(payload: unknown): { reason: "empty" | "upstream_error"; error: string } | null {
  if (isBlank(payload)) return { reason: "empty", error: "Tool returned no data" };

  if (typeof payload === "string") {
    if (/^error\b|error executing tool/i.test(payload.trim())) {
      return { reason: "upstream_error", error: truncate(payload.trim()) };
    }
    return null;
  }

  if (Array.isArray(payload)) {
    const usable = payload.filter((item) => {
      if (isBlank(item)) return false;
      if (isRecord(item) && "items" in item) return !isBlank(item.items);
      return unusableReason(item) === null;
    });
    return usable.length ? null : { reason: "empty", error: "Every result in the response was empty" };
  }

  if (isRecord(payload)) {
    // e.g. {"yield_curve": {"t3m": {"error": ""}, …×6}, "spread_10y2y": 0.0} — derived values from failed inputs.
    const nested = [...records(payload)].slice(1);
    const errorOnly = nested.filter((r) => Object.keys(r).length > 0 && Object.keys(r).every((k) => ERROR_KEY.test(k)));
    if (errorOnly.length > 0 && errorOnly.length * 2 >= nested.length) {
      return { reason: "upstream_error", error: "Most upstream data sources behind this tool failed" };
    }
    if (carriesData(payload)) return null;
    const message = Object.entries(payload).find(([k, v]) => ERROR_KEY.test(k) && typeof v === "string" && v.trim())?.[1];
    if (typeof message === "string") return { reason: "upstream_error", error: truncate(message) };
    const hasErrorKey = Object.keys(payload).some((k) => ERROR_KEY.test(k));
    return hasErrorKey
      ? { reason: "upstream_error", error: "Upstream data source failed without a message" }
      : { reason: "empty", error: "Tool returned no usable values" };
  }
  return null;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface McpClientOptions {
  url?: string;
  fetchImpl?: FetchLike;
  callTimeoutMs?: number;
  initTimeoutMs?: number;
  /**
   * The server degraded badly under ~18 parallel calls. A full run makes at most 5
   * (news 2, macro 3; sentiment and on-chain now call providers directly), so the
   * default lets them all start at once; queueing behind a smaller limit made the last
   * dimension exhaust its budget before its calls even began.
   */
  maxConcurrent?: number;
}

export class SignalMcpClient {
  private session: Promise<string | null> | null = null;
  private nextId = 1;
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(private readonly options: McpClientOptions = {}) {}

  private acquire(signal?: AbortSignal): Promise<void> {
    if (this.active < (this.options.maxConcurrent ?? 10)) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener("abort", onAbort);
        this.active++;
        resolve();
      };
      const onAbort = () => {
        this.waiting = this.waiting.filter((w) => w !== grant);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiting.push(grant);
    });
  }

  private release() {
    this.active--;
    this.waiting.shift()?.();
  }

  private post(body: object, sessionId: string | null, signal: AbortSignal) {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    return fetchImpl(this.options.url ?? SIGNAL_MCP_URL, {
      method: "POST",
      signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  private openSession(parent?: AbortSignal): Promise<string | null> {
    if (!this.session) {
      const session = withTimeout(
        "Signal MCP initialize",
        this.options.initTimeoutMs ?? TIMEOUTS.mcpInitMs,
        async (signal) => {
          const id = this.nextId++;
          const res = await this.post(
            {
              jsonrpc: "2.0",
              id,
              method: "initialize",
              params: {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "killmythesis", version: "0.2.0" },
              },
            },
            null,
            signal,
          );
          const text = await res.text();
          if (!res.ok) throw new ConnectorError("http", `MCP initialize failed (HTTP ${res.status})`);
          const response = findResponse(parseRpcMessages(text), id);
          if (!response?.result) throw new ConnectorError("malformed", "MCP initialize returned no result");
          const sessionId = res.headers.get("mcp-session-id");
          const ack = await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId, signal);
          await ack.text();
          return sessionId;
        },
        parent,
      );
      this.session = session;
      session.catch(() => {
        if (this.session === session) this.session = null;
      });
    }
    return this.session;
  }

  async callTool(name: string, args: Record<string, unknown>, parent?: AbortSignal): Promise<ConnectorResult<unknown>> {
    const source = `Bitget Signal · ${name}`;
    try {
      await this.acquire(parent);
    } catch (err) {
      return failureFromError(source, err);
    }
    try {
      return await withTimeout(
        source,
        this.options.callTimeoutMs ?? TIMEOUTS.mcpCallMs,
        async (signal) => {
          const call = async (sessionId: string | null) => {
            const id = this.nextId++;
            const res = await this.post(
              { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } },
              sessionId,
              signal,
            );
            return { id, res, text: await res.text() };
          };

          const sessionId = await this.openSession(signal);
          let { id, res, text } = await call(sessionId);
          if (res.status === 404 && sessionId) {
            // Session expired on the server: re-initialize once.
            this.session = null;
            ({ id, res, text } = await call(await this.openSession(signal)));
          }
          if (!res.ok) return failure(source, "http", `HTTP ${res.status}`);

          const response = findResponse(parseRpcMessages(text), id);
          if (!response) return failure(source, "malformed", "No JSON-RPC response in body");
          if (response.error) return failure(source, "upstream_error", truncate(response.error.message));

          const result = ToolCallResult.safeParse(response.result);
          if (!result.success) return failure(source, "malformed", "Tool result did not match the MCP schema");

          const output = result.data.content
            .filter((block) => block.type === "text" && block.text)
            .map((block) => block.text)
            .join("\n")
            .trim();
          if (result.data.isError) return failure(source, "upstream_error", truncate(output || "Tool reported an error"));
          if (!output) return failure(source, "empty", "Tool returned no content");

          const payload = parseMaybeJson(output);
          const unusable = unusableReason(payload);
          if (unusable) return failure(source, unusable.reason, unusable.error);
          return success(source, payload);
        },
        parent,
      );
    } catch (err) {
      return failureFromError(source, err);
    } finally {
      this.release();
    }
  }
}

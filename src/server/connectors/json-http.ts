import type { z } from "zod";
import { withTimeout } from "@/server/research/timeouts";
import { failure, failureFromError, success, type ConnectorResult, type FetchLike } from "./types";

/**
 * GET a public JSON endpoint and validate it. Never throws.
 * Non-2xx → http (404 → not_listed), non-JSON → malformed, null/[] → empty, schema mismatch → malformed.
 */
export async function getJson<S extends z.ZodType>(
  fetchImpl: FetchLike,
  source: string,
  url: string,
  schema: S,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ConnectorResult<z.output<S>>> {
  try {
    const { status, text } = await withTimeout(
      source,
      timeoutMs,
      async (s) => {
        const res = await fetchImpl(url, { signal: s, cache: "no-store", headers: { Accept: "application/json" } });
        return { status: res.status, text: await res.text() };
      },
      signal,
    );
    if (status === 404) return failure(source, "not_listed", "HTTP 404");
    if (status < 200 || status >= 300) return failure(source, "http", `HTTP ${status}`);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return failure(source, "malformed", "Non-JSON response");
    }
    if (json === null || (Array.isArray(json) && json.length === 0)) return failure(source, "empty", "Response contained no data");

    const parsed = schema.safeParse(json);
    if (!parsed.success) return failure(source, "malformed", "Response data failed validation");
    return success(source, parsed.data);
  } catch (err) {
    return failureFromError(source, err);
  }
}

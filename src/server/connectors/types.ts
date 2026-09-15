import { TimeoutError } from "@/server/research/timeouts";

/**
 * Every connector call resolves to a ConnectorResult — it never throws.
 * `ok: true` means usable, validated data is present. HTTP 200 alone is not success.
 */
export type FailureReason =
  | "timeout"
  | "network"
  | "http"
  | "malformed"
  | "empty"
  | "upstream_error"
  | "not_listed";

export type ConnectorSuccess<T> = { ok: true; source: string; data: T; fetchedAt: string };
export type ConnectorFailure = { ok: false; source: string; reason: FailureReason; error: string };
export type ConnectorResult<T> = ConnectorSuccess<T> | ConnectorFailure;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ConnectorError extends Error {
  constructor(
    readonly reason: FailureReason,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export const success = <T>(source: string, data: T): ConnectorSuccess<T> => ({
  ok: true,
  source,
  data,
  fetchedAt: new Date().toISOString(),
});

export const failure = (source: string, reason: FailureReason, error: string): ConnectorFailure => ({
  ok: false,
  source,
  reason,
  error,
});

export function failureFromError(source: string, err: unknown): ConnectorFailure {
  if (err instanceof TimeoutError) return failure(source, "timeout", err.message);
  if (err instanceof ConnectorError) return failure(source, err.reason, err.message);
  if (err instanceof Error && err.name === "AbortError") return failure(source, "network", "Request aborted");
  return failure(source, "network", err instanceof Error ? err.message : "Network error");
}

/** Short, user-facing text for a failure reason, e.g. "unavailable · timeout". */
export const FAILURE_TEXT: Record<FailureReason, string> = {
  timeout: "timeout",
  network: "connection failed",
  http: "source error",
  malformed: "unrecognized response",
  empty: "no usable data",
  upstream_error: "no usable data",
  not_listed: "not listed",
};

export const truncate =(text: string, max = 200) => (text.length > max ? `${text.slice(0, max)}…` : text);

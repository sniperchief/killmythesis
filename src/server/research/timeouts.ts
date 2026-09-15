/**
 * Explicit time budgets. One slow source must never block the whole run.
 */
export const TIMEOUTS = {
  /** Bitget public REST call. */
  restMs: 8_000,
  /** Public intelligence provider call (alternative.me, DeFiLlama, CoinGecko). */
  publicMs: 10_000,
  /** MCP session initialize handshake. */
  mcpInitMs: 10_000,
  /** Single MCP tool call (the Signal server has been observed hanging for 60s+). */
  mcpCallMs: 20_000,
  /** Everything one research dimension does, end to end. */
  dimensionMs: 35_000,
  /** One structured LLM call. */
  llmMs: 120_000,
} as const;

export class TimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
  ) {
    super(`${label} timed out after ${ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`}`);
    this.name = "TimeoutError";
  }
}

/**
 * Runs `task` with a hard deadline. The task receives an AbortSignal that fires on
 * timeout or when `parent` aborts; the returned promise rejects on timeout even if
 * the task ignores its signal.
 */
export async function withTimeout<T>(
  label: string,
  ms: number,
  task: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) controller.abort(parent.reason);
  parent?.addEventListener("abort", onParentAbort, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new TimeoutError(label, ms);
      controller.abort(error);
      reject(error);
    }, ms);
  });

  try {
    return await Promise.race([task(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

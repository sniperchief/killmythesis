/**
 * Server-only structured LLM calls. The API key is read from the server
 * environment (.env.local) and never reaches the browser.
 *
 * The LLM only interprets: it parses the thesis, plans research, maps findings
 * to assumptions and writes prose. It never supplies market data, scores or verdicts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { TIMEOUTS } from "@/server/research/timeouts";

/**
 * Cheapest current model ($1 / $5 per MTok), chosen to keep hackathon costs low.
 * Haiku 4.5 supports structured outputs; it does not take `effort` or adaptive
 * thinking, so requests omit both.
 */
export const LLM_MODEL = "claude-haiku-4-5";

/** Missing or rejected credentials — a server configuration problem. */
export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigError";
  }
}

/** The model call failed, refused, truncated, or returned output that failed validation. */
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}

export interface StructuredRequest<S extends z.ZodType> {
  name: string;
  system: string;
  prompt: string;
  schema: S;
}

export type StructuredLlm = <S extends z.ZodType>(request: StructuredRequest<S>, signal?: AbortSignal) => Promise<z.output<S>>;

export function readApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new LlmConfigError("ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local and restart.");
  }
  return key;
}

type ParseClient = { messages: Pick<Anthropic["messages"], "parse"> };

export function createStructuredLlm(client: ParseClient): StructuredLlm {
  return async (request, signal) => {
    let message: Awaited<ReturnType<ParseClient["messages"]["parse"]>>;
    try {
      message = await client.messages.parse(
        {
          model: LLM_MODEL,
          max_tokens: 16000,
          output_config: { format: zodOutputFormat(request.schema) },
          system: request.system,
          messages: [{ role: "user", content: request.prompt }],
        },
        { signal, timeout: TIMEOUTS.llmMs, maxRetries: 1 },
      );
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new LlmConfigError("The Anthropic API rejected ANTHROPIC_API_KEY.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new LlmOutputError(`${request.name}: Anthropic API rate limit reached. Try again shortly.`);
      }
      if (err instanceof Anthropic.APIError) {
        throw new LlmOutputError(`${request.name}: Anthropic API error${err.status ? ` (${err.status})` : ""}.`);
      }
      throw err;
    }

    if (message.stop_reason === "refusal") throw new LlmOutputError(`${request.name}: the model declined this request.`);
    if (message.stop_reason === "max_tokens") throw new LlmOutputError(`${request.name}: the model output was truncated.`);

    const validated = request.schema.safeParse(message.parsed_output);
    if (!validated.success) throw new LlmOutputError(`${request.name}: model output did not match the expected schema.`);
    return validated.data;
  };
}

/** Builds the production LLM. Throws LlmConfigError when the key is missing. */
export function createDefaultLlm(env: Record<string, string | undefined> = process.env): StructuredLlm {
  return createStructuredLlm(new Anthropic({ apiKey: readApiKey(env) }));
}

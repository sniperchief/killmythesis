import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LLM_MODEL, LlmConfigError, LlmOutputError, createDefaultLlm, createStructuredLlm, readApiKey } from "./structured";

type Client = Parameters<typeof createStructuredLlm>[0];

function fakeClient(message: object, capture?: (params: Record<string, unknown>) => void): Client {
  return {
    messages: {
      parse: async (params: Record<string, unknown>) => {
        capture?.(params);
        return message;
      },
    },
  } as unknown as Client;
}

const schema = z.object({ answer: z.number() });
const request = { name: "Test", system: "system", prompt: "prompt", schema };

describe("ANTHROPIC_API_KEY handling", () => {
  it("throws a configuration error when the key is missing or blank", () => {
    expect(() => readApiKey({})).toThrow(LlmConfigError);
    expect(() => readApiKey({ ANTHROPIC_API_KEY: "   " })).toThrow(LlmConfigError);
    expect(() => createDefaultLlm({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("reads the key from the server environment", () => {
    expect(readApiKey({ ANTHROPIC_API_KEY: " sk-test " })).toBe("sk-test");
  });
});

describe("createStructuredLlm", () => {
  it("returns schema-validated output from a Haiku structured-output request", async () => {
    let sent: Record<string, unknown> = {};
    const llm = createStructuredLlm(fakeClient({ stop_reason: "end_turn", parsed_output: { answer: 4 } }, (p) => (sent = p)));
    await expect(llm(request)).resolves.toEqual({ answer: 4 });
    expect(LLM_MODEL).toBe("claude-haiku-4-5");
    expect(sent.model).toBe(LLM_MODEL);
    expect(sent).toHaveProperty("output_config.format");
    // Haiku 4.5 rejects effort and adaptive thinking; server-side fallbacks are an Opus/Fable feature.
    expect(sent).not.toHaveProperty("output_config.effort");
    expect(sent).not.toHaveProperty("thinking");
    expect(sent).not.toHaveProperty("fallbacks");
    expect(JSON.stringify(sent)).not.toMatch(/sk-/);
  });

  it("rejects missing or mismatched structured output", async () => {
    await expect(createStructuredLlm(fakeClient({ stop_reason: "end_turn", parsed_output: null }))(request)).rejects.toThrow(
      LlmOutputError,
    );
    await expect(
      createStructuredLlm(fakeClient({ stop_reason: "end_turn", parsed_output: { answer: "four" } }))(request),
    ).rejects.toThrow(LlmOutputError);
  });

  it("rejects refusals and truncated output", async () => {
    await expect(createStructuredLlm(fakeClient({ stop_reason: "refusal", parsed_output: null }))(request)).rejects.toThrow(
      /declined/,
    );
    await expect(createStructuredLlm(fakeClient({ stop_reason: "max_tokens", parsed_output: null }))(request)).rejects.toThrow(
      /truncated/,
    );
  });
});

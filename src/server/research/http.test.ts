import { describe, expect, it } from "vitest";
import { createDefaultLlm } from "@/server/llm/structured";
import { handleResearchRequest } from "./http";
import { failingMcp, fakePublicData, fakeRest } from "./test-fixtures";

const post = (body: unknown) =>
  new Request("http://localhost/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const connectors = () => ({ rest: fakeRest(), mcp: failingMcp(), publicData: fakePublicData() });

describe("POST /api/research", () => {
  it("returns a 503 configuration error when ANTHROPIC_API_KEY is missing", async () => {
    const res = await handleResearchRequest(post({ thesis: "I think BTC can break its previous high." }), () => ({
      llm: createDefaultLlm({}),
      ...connectors(),
    }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local and restart.",
    });
  });

  it("validates input before calling any external service", async () => {
    let depsCreated = false;
    const makeDeps = () => {
      depsCreated = true;
      return { llm: createDefaultLlm({ ANTHROPIC_API_KEY: "sk-test" }), ...connectors() };
    };
    expect((await handleResearchRequest(post({ thesis: "SOL" }), makeDeps)).status).toBe(400);
    expect((await handleResearchRequest(post({ nope: true }), makeDeps)).status).toBe(400);
    expect((await handleResearchRequest(post({ thesis: "x".repeat(2001) }), makeDeps)).status).toBe(400);
    expect(depsCreated).toBe(false);
  });

  it("streams research events as NDJSON", async () => {
    const res = await handleResearchRequest(
      post({ thesis: "  I think   BTC can break its previous high. " }),
      () => ({ llm: createDefaultLlm({ ANTHROPIC_API_KEY: "sk-test" }), ...connectors() }),
      async (thesis, emit) => {
        emit({ type: "error", message: `received: ${thesis}` });
      },
    );
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([{ type: "error", message: "received: I think BTC can break its previous high." }]);
  });
});

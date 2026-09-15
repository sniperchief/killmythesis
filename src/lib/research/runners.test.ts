import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewRunner } from "@/lib/dev/preview-runner";
import { buildSampleBrief } from "@/lib/dev/sample-fixtures";
import { liveRunner } from "./live-runner";
import type { ResearchEvent } from "./run-state";
import { enforceDataMode, selectRunner } from "./runners";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("live mode never falls back to sample data", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("selects the live runner in live mode", () => {
    expect(selectRunner("live")).toBe(liveRunner);
    expect(selectRunner("sample")).toBe(previewRunner);
  });

  it("discards a sample brief received in live mode", () => {
    const event = enforceDataMode("live", { type: "brief", brief: buildSampleBrief() });
    expect(event.type).toBe("error");
  });

  it("surfaces a server configuration error instead of producing a brief", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local and restart." }, { status: 503 }),
    );
    const events: ResearchEvent[] = [];
    await liveRunner("I think BTC can break its previous high.", (e) => events.push(e), new AbortController().signal);
    expect(events).toEqual([
      { type: "error", message: "ANTHROPIC_API_KEY is not configured on the server. Add it to .env.local and restart." },
    ]);
  });

  it("reports a stream that ends without a result", async () => {
    vi.stubGlobal("fetch", async () => new Response(`${JSON.stringify({ type: "evaluating" })}\n`, { status: 200 }));
    const events: ResearchEvent[] = [];
    await liveRunner("I think BTC can break its previous high.", (e) => events.push(e), new AbortController().signal);
    expect(events.at(-1)).toEqual({ type: "error", message: "The research stream ended before a result was produced." });
  });

  it("keeps sample fixtures out of every server and API module", () => {
    const root = join(process.cwd(), "src");
    const serverFiles = [...sourceFiles(join(root, "server")), ...sourceFiles(join(root, "app", "api"))].filter(
      (f) => !f.endsWith(".test.ts"),
    );
    expect(serverFiles.length).toBeGreaterThan(5);
    for (const file of serverFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/lib\/dev|sample-fixtures|preview-runner/);
    }
  });
});

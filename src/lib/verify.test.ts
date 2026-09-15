import { describe, expect, it } from "vitest";
import { safeVerifyLink } from "./verify";

describe("safeVerifyLink", () => {
  it("keeps https links", () => {
    expect(safeVerifyLink({ url: "https://defillama.com/chain/Solana", label: "DeFiLlama" })).toEqual({
      url: "https://defillama.com/chain/Solana",
      label: "DeFiLlama",
    });
  });

  it("drops missing, non-https, malformed and unlabeled links", () => {
    expect(safeVerifyLink(undefined)).toBeNull();
    expect(safeVerifyLink({ url: "http://example.com", label: "x" })).toBeNull();
    expect(safeVerifyLink({ url: "javascript:alert(1)", label: "x" })).toBeNull();
    expect(safeVerifyLink({ url: "not a url", label: "x" })).toBeNull();
    expect(safeVerifyLink({ url: "https://example.com", label: " " })).toBeNull();
  });
});

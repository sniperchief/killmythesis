import type { VerifyLink } from "./types";

/**
 * Only well-formed https links are rendered. Anything else, including links from
 * tampered or older history entries, is dropped rather than shown.
 */
export function safeVerifyLink(link: VerifyLink | undefined | null): VerifyLink | null {
  if (!link || typeof link.url !== "string" || typeof link.label !== "string" || !link.label.trim()) return null;
  try {
    const url = new URL(link.url);
    return url.protocol === "https:" ? { url: url.toString(), label: link.label.trim() } : null;
  } catch {
    return null;
  }
}

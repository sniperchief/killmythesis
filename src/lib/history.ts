import { useSyncExternalStore } from "react";
import { VERDICT_META } from "./labels";
import type { ResearchBrief } from "./types";

/**
 * Research history, persisted in this browser (V1 has no accounts).
 * Only live research is saved — sample previews are never written here.
 * A brief launched from Narrative Radar carries `brief.origin`, so the entry
 * records the originating narrative without a schema change.
 */
export type HistoryEntry = { id: string; kind: "thesis"; createdAt: string; title: string; label: string; brief: ResearchBrief };

const STORAGE_KEY = "kmt.history.v1";
const CHANGE_EVENT = "kmt:history";
const MAX_ENTRIES = 100;
const EMPTY: HistoryEntry[] = [];

let cachedRaw: string | null = null;
let cachedEntries: HistoryEntry[] = EMPTY;

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** Drops anything that is not a readable thesis entry (e.g. tampered or pre-release data). */
const isEntry = (value: unknown): value is HistoryEntry =>
  typeof value === "object" &&
  value !== null &&
  (value as HistoryEntry).kind === "thesis" &&
  typeof (value as HistoryEntry).brief === "object" &&
  (value as HistoryEntry).brief !== null;

function getSnapshot(): HistoryEntry[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      cachedEntries = Array.isArray(parsed) ? parsed.filter(isEntry) : EMPTY;
    } catch {
      cachedEntries = EMPTY;
    }
  }
  return cachedEntries;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked — history is a convenience, research still works.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function saveHistoryEntry(entry: HistoryEntry) {
  write([entry, ...getSnapshot().filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES));
}

export function clearHistory() {
  write([]);
}

export function briefToHistoryEntry(brief: ResearchBrief): HistoryEntry {
  const stance = brief.thesis.stance.charAt(0) + brief.thesis.stance.slice(1).toLowerCase();
  return {
    id: brief.id,
    kind: "thesis",
    createdAt: brief.createdAt,
    title: `${brief.thesis.subject} ${stance}`,
    label: VERDICT_META[brief.verdict].label,
    brief,
  };
}

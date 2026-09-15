"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { DATA_MODE } from "@/lib/config";
import { briefToHistoryEntry, saveHistoryEntry } from "@/lib/history";
import { initialRunState, runReducer, type ResearchEvent, type RunNarrative } from "./run-state";
import { enforceDataMode, selectRunner } from "./runners";

export function useResearchRun() {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback((input: string, narrative: RunNarrative | null = null) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    dispatch({ type: "start", input, narrative });

    const emit = (raw: ResearchEvent) => {
      if (controller.signal.aborted) return;
      const event = enforceDataMode(DATA_MODE, raw);
      // Only real research is persisted; sample previews never enter history.
      if (event.type === "brief" && event.brief.mode === "live") {
        saveHistoryEntry(briefToHistoryEntry(event.brief));
      }
      dispatch(event);
    };

    const runner = selectRunner(DATA_MODE);
    runner(input, emit, controller.signal, narrative ? { narrativeId: narrative.id } : {}).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      dispatch({ type: "error", message: err instanceof Error ? err.message : "Research failed." });
    });
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, start, reset };
}

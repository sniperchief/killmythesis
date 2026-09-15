"use client";

import { useEffect, useRef, useState } from "react";
import type { NarrativeHandoff } from "@/lib/radar/handoff";
import type { RunNarrative } from "@/lib/research/run-state";
import { useResearchRun } from "@/lib/research/useResearchRun";
import { ResearchSession } from "./ResearchSession";
import { ThesisComposer } from "./ThesisComposer";

const toRunNarrative = (n: NarrativeHandoff | null): RunNarrative | null => (n ? { id: n.id, name: n.name } : null);

export function ThesisWorkspace({
  initialThesis,
  autoRun,
  narrative,
}: {
  initialThesis: string;
  autoRun: boolean;
  narrative: NarrativeHandoff | null;
}) {
  const { state, start, reset } = useResearchRun();
  const [draft, setDraft] = useState(initialThesis);
  const [context, setContext] = useState(narrative);
  const autoStarted = useRef(false);

  useEffect(() => {
    if (autoRun && !autoStarted.current) {
      autoStarted.current = true;
      start(initialThesis, toRunNarrative(narrative));
    }
  }, [autoRun, initialThesis, narrative, start]);

  if (state.phase === "idle") {
    return (
      <ThesisComposer
        value={draft}
        onChange={setDraft}
        narrative={context}
        onRemoveNarrative={() => setContext(null)}
        onSubmit={() => {
          const thesis = draft.trim();
          if (thesis) start(thesis, toRunNarrative(context));
        }}
      />
    );
  }

  return <ResearchSession state={state} onNewThesis={reset} onRetry={() => start(state.input, state.narrative)} />;
}

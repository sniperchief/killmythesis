"use client";

import Link from "next/link";
import { ResearchBriefView } from "@/components/brief/ResearchBriefView";
import { Label, SampleNotice, SourceStatusList } from "@/components/ui/primitives";
import { PAGE, buttonPrimary, buttonSecondary } from "@/components/ui/styles";
import { DATA_MODE } from "@/lib/config";
import type { RunPhase, RunState } from "@/lib/research/run-state";
import type { ThesisClarification } from "@/lib/types";
import { ParsedThesisView } from "./ParsedThesisView";

function ClarificationPanel({ clarification, onRevise }: { clarification: ThesisClarification; onRevise: () => void }) {
  return (
    <div className="border border-caution/30 bg-caution-wash p-6">
      <Label className="text-caution">The thesis is underspecified</Label>
      <p className="mt-2 text-[16px] leading-relaxed">{clarification.message}</p>
      <p className="mt-1 text-[13px] text-muted">Nothing was researched. KillMyThesis doesn’t invent reasons you didn’t give.</p>
      <dl className="mt-5 grid gap-5 border-t border-caution/20 pt-4 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">What we understood</dt>
          <dd className="mt-1.5 space-y-1 text-[13.5px] text-ink-soft">
            {clarification.subject && <div>Subject: {clarification.subject}</div>}
            <div>Direction: {clarification.stance ?? "unclear"}</div>
            {clarification.known.map((k) => (
              <div key={k}>{k}</div>
            ))}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">What’s missing</dt>
          <dd className="mt-1.5 space-y-1 text-[13.5px] text-ink-soft">
            {clarification.missing.length ? clarification.missing.map((m) => <div key={m}>{m}</div>) : <div>Your reasoning</div>}
          </dd>
        </div>
      </dl>
      <button type="button" onClick={onRevise} className={`${buttonPrimary} mt-6`}>
        Revise thesis
      </button>
    </div>
  );
}

export function ResearchSession({
  state,
  onNewThesis,
  onRetry,
}: {
  state: RunState;
  onNewThesis: () => void;
  onRetry: () => void;
}) {
  const finished = state.sources.filter((s) => s.status === "ok" || s.status === "unavailable").length;

  return (
    <div className={`${PAGE} py-8 lg:py-10`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4">
        <Label className="text-ink">Research session</Label>
        <PhaseIndicator phase={state.phase} finished={finished} total={state.sources.length} />
        <button type="button" onClick={onNewThesis} className={`${buttonSecondary} ml-auto`}>
          New thesis
        </button>
      </div>

      {DATA_MODE === "sample" && (
        <SampleNotice className="mt-4">
          The research engine isn’t connected yet. This session replays a sample brief for a reference SOL thesis
          instead of parsing your input. None of it is live market data, and it won’t be saved to history.
        </SampleNotice>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <aside className="space-y-8 lg:col-span-4">
          <div>
            <Label>You submitted</Label>
            <p className="mt-2 border-l-2 border-line-strong pl-3 text-[13.5px] leading-relaxed text-ink-soft">
              {state.input}
            </p>
            {state.narrative && (
              <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
                From Narrative Radar ·{" "}
                <Link href={`/radar/${state.narrative.id}`} className="text-ink underline decoration-accent underline-offset-2">
                  {state.narrative.name}
                </Link>
              </p>
            )}
          </div>

          {state.thesis ? (
            <ParsedThesisView thesis={state.thesis} evaluations={state.brief?.assumptions} />
          ) : state.phase === "parsing" ? (
            <StepLine active label="Parsing thesis into testable assumptions" />
          ) : null}

          {state.sources.length > 0 && (
            <div>
              <Label>{state.phase === "researching" ? "Researching" : "Research sources"}</Label>
              <div className="mt-3">
                <SourceStatusList sources={state.sources} />
              </div>
            </div>
          )}
        </aside>

        <section className="min-w-0 lg:col-span-8">
          {state.phase === "needs_input" && state.clarification ? (
            <ClarificationPanel clarification={state.clarification} onRevise={onNewThesis} />
          ) : state.phase === "failed" ? (
            <div className="border border-challenge/30 bg-challenge-wash p-6">
              <Label className="text-challenge">Research failed</Label>
              <p className="mt-2 text-[15px]">{state.error}</p>
              <p className="mt-1 text-[13px] text-muted">No brief was produced, and nothing was filled in.</p>
              <button type="button" onClick={onRetry} className={`${buttonPrimary} mt-5`}>
                Retry
              </button>
            </div>
          ) : state.brief ? (
            <ResearchBriefView brief={state.brief} />
          ) : (
            <PipelineProgress phase={state.phase} />
          )}
        </section>
      </div>
    </div>
  );
}

const PHASE_TEXT: Record<RunPhase, string> = {
  idle: "Idle",
  parsing: "Parsing thesis",
  researching: "Researching",
  evaluating: "Evaluating evidence",
  complete: "Complete",
  needs_input: "Needs more detail",
  failed: "Failed",
};

function PhaseIndicator({ phase, finished, total }: { phase: RunPhase; finished: number; total: number }) {
  const busy = phase === "parsing" || phase === "researching" || phase === "evaluating";
  const color =
    phase === "complete" ? "bg-support" : phase === "failed" ? "bg-challenge" : phase === "needs_input" ? "bg-caution" : "bg-accent";
  return (
    <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${color} ${busy ? "pulse-dot" : ""}`} />
      {PHASE_TEXT[phase]}
      {phase === "researching" && total > 0 && ` · ${finished}/${total}`}
    </span>
  );
}

const PIPELINE: { label: string; doneAfter: RunPhase[]; activeIn: RunPhase }[] = [
  { label: "Parse thesis into assumptions", doneAfter: ["researching", "evaluating"], activeIn: "parsing" },
  { label: "Research each dimension", doneAfter: ["evaluating"], activeIn: "researching" },
  { label: "Map evidence to assumptions", doneAfter: [], activeIn: "evaluating" },
  { label: "Score thesis and write brief", doneAfter: [], activeIn: "evaluating" },
];

function PipelineProgress({ phase }: { phase: RunPhase }) {
  return (
    <div className="border border-line bg-surface p-6">
      <Label>Research brief</Label>
      <p className="mt-2 text-[15px] text-ink-soft">The brief appears once every source has reported back.</p>
      <ol className="mt-6 space-y-3">
        {PIPELINE.map((step) => (
          <li key={step.label}>
            <StepLine label={step.label} done={step.doneAfter.includes(phase)} active={step.activeIn === phase} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepLine({ label, done = false, active = false }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-[13.5px]">
      {done ? (
        <span className="w-4 font-mono text-support">✓</span>
      ) : (
        <span className="flex w-4 justify-center">
          <span className={`h-1.5 w-1.5 rounded-full ${active ? "pulse-dot bg-accent" : "border border-line-strong"}`} />
        </span>
      )}
      <span className={done || active ? "text-ink" : "text-muted"}>{label}</span>
    </div>
  );
}

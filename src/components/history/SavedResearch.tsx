"use client";

import Link from "next/link";
import { ResearchBriefView } from "@/components/brief/ResearchBriefView";
import { ParsedThesisView } from "@/components/thesis/ParsedThesisView";
import { Label, SourceStatusList } from "@/components/ui/primitives";
import { buttonSecondary, monoMeta } from "@/components/ui/styles";
import { useHistory } from "@/lib/history";
import { useHydrated } from "@/lib/useHydrated";

export function SavedResearch({ id }: { id: string }) {
  const entries = useHistory();
  const hydrated = useHydrated();

  if (!hydrated) return null;

  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    return (
      <div className="border border-line bg-surface px-6 py-12 text-center">
        <Label>Research not found</Label>
        <p className="mt-3 text-[14px] text-ink-soft">This entry isn’t saved in this browser.</p>
        <Link href="/history" className={`${buttonSecondary} mt-6`}>
          Back to history
        </Link>
      </div>
    );
  }

  const { brief } = entry;
  return (
    <>
      <Link href="/history" className={`text-muted hover:text-ink ${monoMeta}`}>
        ← Research history
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-12">
        <aside className="space-y-8 lg:col-span-4">
          <ParsedThesisView thesis={brief.thesis} evaluations={brief.assumptions} />
          <div>
            <Label>Research sources</Label>
            <div className="mt-3">
              <SourceStatusList sources={brief.sources} />
            </div>
          </div>
        </aside>
        <section className="min-w-0 lg:col-span-8">
          <ResearchBriefView brief={brief} />
        </section>
      </div>
    </>
  );
}

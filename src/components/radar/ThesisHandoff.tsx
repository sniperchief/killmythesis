"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, monoMeta } from "@/components/ui/styles";
import { handoffHref } from "@/lib/radar/handoff";

const MIN_LENGTH = 8;

export function ThesisHandoff({
  narrativeId,
  narrativeName,
  formThesis,
  killThesis,
}: {
  narrativeId: string;
  narrativeName: string;
  formThesis: string;
  killThesis: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(killThesis);
  const thesis = draft.trim();

  return (
    <div>
      <Link href={handoffHref(narrativeId, formThesis)} className={`${buttonPrimary} w-full`}>
        Form a thesis
      </Link>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        Opens KillMyThesis with a starting claim about {narrativeName} and this narrative’s research context. Edit it
        there. Nothing runs until you submit.
      </p>

      <div className="mt-6 border-t border-line pt-5">
        <label htmlFor="kill-thesis" className={`block text-ink ${monoMeta}`}>
          Kill this thesis
        </label>
        <textarea
          id="kill-thesis"
          rows={3}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-2 block w-full resize-none border border-line-strong bg-paper px-3 py-2.5 text-[14px] leading-relaxed outline-none focus:border-ink"
        />
        <button
          type="button"
          disabled={thesis.length < MIN_LENGTH}
          onClick={() => router.push(handoffHref(narrativeId, thesis, true))}
          className="mt-3 inline-flex w-full items-center justify-center border border-ink bg-surface px-5 py-3 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-line-strong disabled:text-muted disabled:hover:bg-surface"
        >
          Kill this thesis
        </button>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Starts KillMyThesis research on the claim above, with this narrative as context. Edit it first if it isn’t
          your view.
        </p>
      </div>
    </div>
  );
}

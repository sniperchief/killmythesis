import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { ExplanationLoading, type ExplanationPart } from "@/components/radar/ExplanationView";
import { NarrativeDetail } from "@/components/radar/NarrativeDetail";
import { NarrativeExplanation } from "@/components/radar/NarrativeExplanation";
import { PAGE } from "@/components/ui/styles";
import { DATA_MODE } from "@/lib/config";
import { buildSampleRadar } from "@/lib/dev/sample-radar";
import { getNarrativeDefinition } from "@/lib/radar/taxonomy";
import { getRadarSnapshot } from "@/server/radar/snapshot";

export async function generateMetadata({ params }: PageProps<"/radar/[id]">) {
  const definition = getNarrativeDefinition((await params).id);
  return { title: definition ? `${definition.name} — Narrative Radar` : "Narrative Radar — KillMyThesis" };
}

export default async function NarrativePage({ params }: PageProps<"/radar/[id]">) {
  const { id } = await params;
  if (!getNarrativeDefinition(id)) notFound();

  await connection();
  const snapshot = DATA_MODE === "live" ? await getRadarSnapshot() : buildSampleRadar();
  const reading = snapshot.narratives.find((n) => n.id === id);
  if (!reading) notFound();

  // The metrics render immediately; the AI explanation streams in (one cached call shared by all three parts).
  const explanation = (part: ExplanationPart, fallback: ReactNode) => (
    <Suspense fallback={fallback}>
      <NarrativeExplanation reading={reading} snapshot={snapshot} part={part} />
    </Suspense>
  );

  return (
    <div className={`${PAGE} py-8 lg:py-10`}>
      <NarrativeDetail
        snapshot={snapshot}
        reading={reading}
        why={explanation("why", <ExplanationLoading />)}
        wrong={explanation("wrong", null)}
        next={explanation("next", null)}
      />
    </div>
  );
}

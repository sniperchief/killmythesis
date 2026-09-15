import { ThesisWorkspace } from "@/components/thesis/ThesisWorkspace";
import { parseHandoff } from "@/lib/radar/handoff";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Narrative Radar hands a thesis over via ?thesis=…&narrative=<id>[&run=1]
  const { thesis, autoRun, narrative } = parseHandoff(await searchParams);
  return (
    <ThesisWorkspace
      key={`${narrative?.id ?? ""}|${autoRun}|${thesis}`}
      initialThesis={thesis}
      autoRun={autoRun}
      narrative={narrative}
    />
  );
}

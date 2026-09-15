import { connection } from "next/server";
import { RadarView } from "@/components/radar/RadarView";
import { DATA_MODE } from "@/lib/config";
import { buildSampleRadar } from "@/lib/dev/sample-radar";
import { getRadarSnapshot } from "@/server/radar/snapshot";

export const metadata = { title: "Narrative Radar — KillMyThesis" };

export default async function RadarPage() {
  // Market data is read at request time (from a short-lived cache), never baked in at build.
  await connection();
  const snapshot = DATA_MODE === "live" ? await getRadarSnapshot() : buildSampleRadar();
  return <RadarView snapshot={snapshot} />;
}

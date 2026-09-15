"use client";

import { useEffect } from "react";
import { Label } from "@/components/ui/primitives";
import { PAGE, buttonPrimary } from "@/components/ui/styles";

export default function RadarError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[radar] render failed", error);
  }, [error]);

  return (
    <div className={`${PAGE} py-10 lg:py-14`}>
      <div role="alert" className="border border-challenge/30 bg-challenge-wash p-6">
        <Label className="text-challenge">Narrative Radar could not load</Label>
        <p className="mt-2 text-[15px]">Something went wrong while reading market data. No narrative was classified or filled in.</p>
        <button type="button" onClick={() => retry()} className={`${buttonPrimary} mt-5`}>
          Retry
        </button>
      </div>
    </div>
  );
}

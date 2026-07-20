"use client";

import type { ViralScorecard } from "@/lib/growth-types";
import {
  buildGrowthRecommendations,
  type GrowthRecAction,
} from "@/lib/growth-recommendations";

type Props = {
  score: ViralScorecard;
  onAction?: (action: GrowthRecAction) => void;
  /** Jump to a Growth Hub tab from inside the hub */
  onHubTab?: (tab: "dub" | "thumbs") => void;
};

export function GrowthRecommendations({ score, onAction, onHubTab }: Props) {
  const recs = buildGrowthRecommendations(score);
  if (!recs.length) return null;

  function handle(action: GrowthRecAction) {
    if (action === "dub") onHubTab?.("dub");
    else if (action === "thumbs") onHubTab?.("thumbs");
    else onAction?.(action);
  }

  return (
    <section className="cc-growth-recs" aria-label="Recommended next steps">
      <strong>Recommendations</strong>
      <p className="cc-lib-hint">Based on your score — jump to a fix.</p>
      <div className="cc-growth-rec-chips">
        {recs.map((r) => (
          <button
            key={r.id}
            type="button"
            className="cc-hook-chip"
            title={r.source}
            aria-label={`${r.label}: ${r.source}`}
            onClick={() => handle(r.action)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </section>
  );
}

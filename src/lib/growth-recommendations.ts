import type { ViralScorecard } from "@/lib/growth-types";

export type GrowthRecAction =
  | "captions"
  | "reframe"
  | "music"
  | "cleanup"
  | "analyze"
  | "dub"
  | "thumbs"
  | "transcript";

export type GrowthRec = {
  id: string;
  label: string;
  action: GrowthRecAction;
  /** Original score text that triggered this chip */
  source: string;
};

const RULES: {
  test: RegExp;
  action: GrowthRecAction;
  label: string;
}[] = [
  { test: /caption|subtitle|burn|mobile retention/i, action: "captions", label: "Add captions" },
  { test: /reframe|punch|visual|talking head|zoom/i, action: "reframe", label: "AI Reframe" },
  { test: /music|bed|duck/i, action: "music", label: "Add music bed" },
  { test: /silence|filler|trim|clean/i, action: "cleanup", label: "Open cleanup" },
  { test: /hook|first 3|opening|weak hook/i, action: "captions", label: "Strengthen hook" },
  { test: /beat|cut into|pacing/i, action: "transcript", label: "Cut in transcript" },
  { test: /thumb|ctr|click/i, action: "thumbs", label: "Generate thumbs" },
  { test: /dub|translate|lang/i, action: "dub", label: "Audio dub overlay" },
  { test: /analyze|score|viral/i, action: "analyze", label: "Run analyze" },
];

/** Map viralScore improvements + reasons into actionable recommendation chips. */
export function buildGrowthRecommendations(score: ViralScorecard): GrowthRec[] {
  const lines = [...(score.improvements || []), ...score.reasons];
  const seen = new Set<GrowthRecAction>();
  const out: GrowthRec[] = [];

  for (const text of lines) {
    for (const rule of RULES) {
      if (!rule.test.test(text) || seen.has(rule.action)) continue;
      seen.add(rule.action);
      out.push({
        id: `${rule.action}-${out.length}`,
        label: rule.label,
        action: rule.action,
        source: text,
      });
    }
  }

  return out.slice(0, 6);
}

/**
 * Semantic / expanded transcript search (Phase 15).
 */

import { llmComplete, parseLlmJson } from "./llm";
import { searchTranscript, type TranscriptHit } from "./transcript-search";
import type { TranscriptSegment } from "./types";

const SYNONYMS: Record<string, string[]> = {
  price: ["pricing", "cost", "fee", "money", "budget", "expensive", "cheap"],
  pricing: ["price", "cost", "fee", "subscription", "plan"],
  intro: ["introduction", "opening", "hook", "start", "beginning"],
  hook: ["intro", "opening", "start", "attention"],
  funny: ["humor", "joke", "laugh", "comedy", "hilarious"],
  sad: ["emotional", "cry", "touching", "heartbreaking"],
  question: ["ask", "why", "how", "what", "wonder"],
  product: ["feature", "demo", "tool", "app", "software"],
  demo: ["product", "walkthrough", "showcase", "tutorial"],
  cta: ["subscribe", "follow", "link", "comment", "share", "buy"],
  music: ["beat", "song", "audio", "soundtrack"],
  silence: ["pause", "quiet", "dead air", "gap"],
};

function expandQueryTokens(query: string): string[] {
  const base = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set(base);
  for (const t of base) {
    out.add(t);
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (t === key || syns.includes(t)) {
        out.add(key);
        for (const s of syns) out.add(s);
      }
    }
  }
  return [...out];
}

/** Heuristic search with synonym expansion + optional asset tag hits. */
export function searchTranscriptExpanded(
  segments: TranscriptSegment[],
  query: string,
  assetTags: string[] = [],
): TranscriptHit[] {
  const tokens = expandQueryTokens(query);
  const expandedQuery = tokens.join(" ");
  const hits = searchTranscript(segments, expandedQuery);

  const qLower = query.toLowerCase();
  const tagTokens = expandQueryTokens(
    [...assetTags, ...assetTags.join(" ").split(/\s+/)].join(" "),
  );
  const tagMatch = tagTokens.some(
    (t) => qLower.includes(t) || tokens.some((tok) => t.includes(tok) || tok.includes(t)),
  );
  if (tagMatch && segments.length) {
    const tagHit: TranscriptHit = {
      start: segments[0].start,
      end: segments[0].end,
      text: `[asset tags: ${assetTags.slice(0, 6).join(", ")}]`,
      score: 8,
    };
    if (!hits.some((h) => Math.abs(h.start - tagHit.start) < 0.5)) {
      hits.unshift(tagHit);
    }
  }

  // Re-score: boost hits matching more expanded tokens
  for (const h of hits) {
    const lower = h.text.toLowerCase();
    let bonus = 0;
    for (const t of tokens) {
      if (lower.includes(t)) bonus += 1;
    }
    h.score += bonus;
  }

  hits.sort((a, b) => b.score - a.score || a.start - b.start);
  return hits.slice(0, 24);
}

type LlmHit = { start: number; score: number; reason?: string };

/** LLM picks transcript moments by meaning. Falls back to expanded search. */
export async function searchTranscriptSemantic(
  segments: TranscriptSegment[],
  query: string,
  assetTags: string[] = [],
): Promise<{ hits: TranscriptHit[]; usedLlm: boolean; mode: "semantic" | "expanded" }> {
  const excerpt = segments
    .slice(0, 80)
    .map((s) => `[${s.start.toFixed(1)}s] ${s.text}`)
    .join("\n")
    .slice(0, 6000);

  const { text, usedLlm } = await llmComplete({
    system:
      "You find transcript moments that match a user's search intent. Reply JSON only: {\"hits\":[{\"start\":number,\"score\":1-10,\"reason\":\"short\"}]}",
    user: `Query: ${query}\nAsset tags: ${assetTags.join(", ") || "none"}\n\nTranscript:\n${excerpt}`,
    maxTokens: 500,
    temperature: 0.2,
  });

  if (usedLlm && text) {
    const parsed = parseLlmJson<{ hits?: LlmHit[] }>(text);
    if (parsed?.hits?.length) {
      const hits: TranscriptHit[] = [];
      for (const lh of parsed.hits.slice(0, 16)) {
        const seg = segments.find(
          (s) => lh.start >= s.start - 0.5 && lh.start <= s.end + 0.5,
        ) || segments.reduce((best, s) =>
          Math.abs(s.start - lh.start) < Math.abs(best.start - lh.start) ? s : best,
        segments[0]);
        if (!seg) continue;
        hits.push({
          start: seg.start,
          end: seg.end,
          text: seg.text,
          score: lh.score * 2 + 10,
        });
      }
      if (hits.length) {
        return { hits, usedLlm: true, mode: "semantic" };
      }
    }
  }

  return {
    hits: searchTranscriptExpanded(segments, query, assetTags),
    usedLlm: false,
    mode: "expanded",
  };
}

/**
 * Client-safe transcript search helpers (Phase 2).
 */

import type { TranscriptSegment } from "./types";

export type TranscriptHit = {
  start: number;
  end: number;
  text: string;
  score: number;
};

/** Find transcript windows matching a query (case-insensitive substring / tokens). */
export function searchTranscript(
  segments: TranscriptSegment[],
  query: string,
): TranscriptHit[] {
  const q = query.trim().toLowerCase();
  if (!q || !segments.length) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: TranscriptHit[] = [];

  for (const s of segments) {
    const text = (s.text || "").trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    let score = 0;
    if (lower.includes(q)) score += 10;
    for (const t of tokens) {
      if (lower.includes(t)) score += 3;
    }
    if (score > 0) {
      hits.push({
        start: s.start,
        end: s.end,
        text,
        score,
      });
    }
  }

  // Also search sliding merges of adjacent segments for multi-word phrases
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    const merged = `${a.text} ${b.text}`.replace(/\s+/g, " ").trim();
    if (merged.toLowerCase().includes(q) && q.includes(" ")) {
      hits.push({
        start: a.start,
        end: b.end,
        text: merged,
        score: 12,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.start - b.start);
  // Dedupe near-identical starts
  const out: TranscriptHit[] = [];
  for (const h of hits) {
    if (out.some((o) => Math.abs(o.start - h.start) < 0.35)) continue;
    out.push(h);
    if (out.length >= 24) break;
  }
  return out;
}

/** Active segment index at playhead time. */
export function activeSegmentIndex(
  segments: TranscriptSegment[],
  t: number,
): number {
  let best = -1;
  for (let i = 0; i < segments.length; i++) {
    if (t >= segments[i].start && t < segments[i].end) return i;
    if (segments[i].start <= t) best = i;
  }
  return best;
}

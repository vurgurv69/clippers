/**
 * YouTube publish metadata helpers (Phase 32).
 */

import { formatYoutubeChaptersBlock } from "./growth-chapters";
import type { GrowthPack } from "./growth-types";

/** Strip # from hashtags for YouTube snippet.tags (max 500 chars total API-side). */
export function youtubeTagsFromPack(pack?: GrowthPack | null): string[] {
  if (!pack?.hashtags) return [];
  const raw =
    pack.hashtags.youtube ||
    pack.hashtags.shorts ||
    pack.hashtags.tiktok ||
    [];
  const out: string[] = [];
  let budget = 450;
  for (const t of raw) {
    const clean = String(t)
      .replace(/^#/, "")
      .replace(/[^\w\u0600-\u06ff\- ]/gi, "")
      .trim()
      .slice(0, 30);
    if (!clean || out.includes(clean)) continue;
    if (budget - clean.length < 0) break;
    out.push(clean);
    budget -= clean.length + 1;
  }
  for (const kw of pack.seoKeywords || []) {
    const clean = String(kw)
      .replace(/^#/, "")
      .trim()
      .slice(0, 30);
    if (!clean || out.includes(clean)) continue;
    if (budget - clean.length < 0) break;
    out.push(clean);
    budget -= clean.length + 1;
  }
  return out.slice(0, 15);
}

/** Build description with chapters + SEO footer for YouTube. */
export function buildYoutubeDescription(
  pack?: GrowthPack | null,
  fallback?: string,
): string {
  const base =
    (fallback || pack?.description || "").trim() ||
    "Uploaded with Clippers Growth Hub";
  const parts = [base];
  if (pack?.cta?.trim()) {
    parts.push(pack.cta.trim());
  }
  const chapters = pack?.chapters?.length
    ? formatYoutubeChaptersBlock(pack.chapters)
    : "";
  if (chapters) {
    parts.push("", chapters);
  }
  if (pack?.seoKeywords?.length) {
    parts.push(
      "",
      pack.seoKeywords
        .slice(0, 12)
        .map((k) => (k.startsWith("#") ? k : `#${k.replace(/\s+/g, "")}`))
        .join(" "),
    );
  }
  return parts.join("\n").slice(0, 5000);
}

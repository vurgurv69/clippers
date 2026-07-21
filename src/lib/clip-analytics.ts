/**
 * Auto pack: chapters, SEO score, platform tips, thumbnail path helper.
 */
import { formatChapterStamp } from "./growth-chapters";
import type { ClipPlan, TranscriptSegment } from "./types";
import { detectScriptLanguage } from "./topic-title";

export type ClipAnalytics = {
  viralityScore: number;
  retentionScore: number;
  hookScore: number;
  captionQuality: number;
  editingQuality: number;
  platformFit: {
    tiktok: number;
    reels: number;
    shorts: number;
  };
  recommendations: string[];
  seoScore: number;
  chapters: string[];
};

export function buildClipAnalytics(opts: {
  plan: ClipPlan;
  segments: TranscriptSegment[];
  duration: number;
  hasCaptions: boolean;
  layoutUsed?: string;
}): ClipAnalytics {
  const { plan, segments, duration, hasCaptions, layoutUsed } = opts;
  const text = segments
    .filter((s) => s.start < plan.end && s.end > plan.start)
    .map((s) => s.text)
    .join(" ");
  const lang = detectScriptLanguage(text || plan.title);

  const virality = plan.viralityScore || 70;
  const retention = plan.retentionScore || 65;
  const hook = plan.hookScore || 60;
  const captionQ = plan.captionQuality || (hasCaptions ? 75 : 40);
  const editingQuality = Math.round(
    (layoutUsed === "face-top" ? 78 : 70) * 0.5 +
      (duration >= 40 && duration <= 60 ? 85 : 65) * 0.3 +
      (hasCaptions ? 80 : 55) * 0.2,
  );

  const lenFit = duration >= 35 && duration <= 60 ? 92 : duration < 40 ? 80 : 70;
  const platformFit = {
    tiktok: Math.round((virality * 0.4 + hook * 0.3 + lenFit * 0.3) / 1),
    reels: Math.round((virality * 0.35 + captionQ * 0.35 + lenFit * 0.3) / 1),
    shorts: Math.round((retention * 0.4 + hook * 0.3 + lenFit * 0.3) / 1),
  };

  const recommendations: string[] = [];
  if (hook < 65) recommendations.push("Strengthen the first 3 seconds — open on a hook line");
  if (!hasCaptions) recommendations.push("Burn captions for silent-scroll retention");
  if (retention < 60) recommendations.push("Tighten pacing — cut long pauses");
  if (duration > 58) recommendations.push("Trim toward 45–55s for Shorts/Reels");
  if (layoutUsed === "fill" && /game|play|screen/i.test(text)) {
    recommendations.push("Try Face top layout if facecam is present");
  }
  if (lang === "ar") recommendations.push("Arabic captions look best with Tahoma / Readable AI");
  if (!recommendations.length) recommendations.push("Looks export-ready — post with the generated hashtags");

  const titleOk = (plan.title?.length || 0) > 8 ? 20 : 8;
  const tagsOk = Math.min(32, (plan.hashtags?.length || 0) * 8);
  const descOk = (plan.description?.length || 0) > 40 ? 20 : 10;
  const seoScore = Math.round(
    Math.min(98, titleOk + tagsOk + descOk + hook * 0.25 + virality * 0.2),
  );

  // Chapters across the clip relative to source
  const chapters: string[] = [`${formatChapterStamp(plan.start)} ${plan.title}`];
  const mid = (plan.start + plan.end) / 2;
  chapters.push(`${formatChapterStamp(mid)} Peak moment`);
  chapters.push(`${formatChapterStamp(Math.max(plan.start, plan.end - 5))} Closer`);

  return {
    viralityScore: virality,
    retentionScore: retention,
    hookScore: hook,
    captionQuality: captionQ,
    editingQuality,
    platformFit,
    recommendations: recommendations.slice(0, 4),
    seoScore: Math.max(40, Math.min(98, seoScore)),
    chapters,
  };
}

export function buildSourceChapters(plans: ClipPlan[]): string[] {
  const lines = [`0:00 Intro`];
  for (const p of plans) {
    lines.push(`${formatChapterStamp(p.start)} ${p.title}`);
  }
  return lines;
}

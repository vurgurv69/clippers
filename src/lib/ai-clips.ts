import path from "path";
import { ffmpegPath, runCommand } from "./binaries";
import { buildSocialPack, scoreClipWindow } from "./clip-quality";
import { jobDir } from "./jobs";
import { hasOpenAiKey, llmComplete, parseLlmJson } from "./llm";
import {
  detectScriptLanguage,
  topicHookFromTranscript,
  topicTitleFromTranscript,
} from "./topic-title";
import type { ClipPlan, TranscriptSegment } from "./types";

const DEAD_WORDS = [
  "subscribe",
  "like and subscribe",
  "follow me",
  "smash that",
  "comment below",
  "thanks for watching",
  "see you next",
  "sponsor",
  "sponsored",
  "use code",
  "اشترك",
  "لايك",
  "تابعوني",
];

/** Long-form (YouTube etc.): aim for 40–60s cuts. Short sources keep full length. */
const LONG_CLIP_MIN = 40;
const LONG_CLIP_MAX = 60;
const SHORT_SOURCE_MAX = 40;

function enrichPlan(
  plan: ClipPlan,
  segments: TranscriptSegment[],
  activeOverlap = 0.7,
  duration = 120,
): ClipPlan {
  const q = scoreClipWindow({
    segments,
    start: plan.start,
    end: plan.end,
    activeOverlap,
    duration,
  });
  const text = windowText(segments, plan.start, plan.end);
  const lang = detectScriptLanguage(text || plan.title);
  const social = buildSocialPack({
    title: plan.title,
    hook: plan.hook,
    text,
    lang,
  });
  return {
    ...plan,
    viralityScore: plan.viralityScore || q.viralityScore,
    retentionScore: q.retentionScore,
    hookScore: q.hookScore,
    confidenceScore: q.confidenceScore,
    captionQuality: q.captionQuality,
    reason:
      plan.reason.includes("·")
        ? `${plan.reason} · ${q.reasons[0] || ""}`.trim()
        : `Clippers score · ${q.reasons.join(" + ")}`,
    description: social.description,
    hashtags: social.hashtags,
    pinnedComment: social.pinnedComment,
    cta: social.cta,
  };
}

function clampClip(
  start: number,
  end: number,
  duration: number,
  mode: "short" | "long",
): { start: number; end: number } {
  let s = Math.max(0, start);
  let e = Math.min(duration, end);

  if (mode === "short") {
    // Keep whatever we have; never invent length past the source
    if (e <= s) {
      s = 0;
      e = duration;
    }
    return { start: Number(s.toFixed(2)), end: Number(e.toFixed(2)) };
  }

  let len = e - s;

  if (len < LONG_CLIP_MIN) {
    const mid = (s + e) / 2;
    s = Math.max(0, mid - 25);
    e = Math.min(duration, s + 50);
    if (e - s < LONG_CLIP_MIN) s = Math.max(0, e - 45);
  }

  if (e - s > LONG_CLIP_MAX) e = s + 55;
  if (e > duration) {
    e = duration;
    s = Math.max(0, e - 55);
  }

  return { start: Number(s.toFixed(2)), end: Number(e.toFixed(2)) };
}

function shortSourcePlans(opts: {
  duration: number;
  segments: TranscriptSegment[];
  videoTitle: string;
}): ClipPlan[] {
  const { duration, segments, videoTitle } = opts;
  const usedTitles = new Set<string>();
  const start = 0;
  const end = Number(duration.toFixed(2));
  const text = windowText(segments, start, end);
  const clipTitle = topicTitleFromTranscript({
    text,
    videoTitle,
    start,
    usedTitles,
  });

  return [
    enrichPlan(
      {
        id: "clip-1",
        title: clipTitle,
        hook: topicHookFromTranscript(text, clipTitle),
        start,
        end,
        viralityScore: 88,
        reason: "Short source · full video export (under 40s)",
      },
      segments,
      0.85,
      duration,
    ),
  ];
}

function windowText(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): string {
  return segments
    .filter((s) => s.start < end && s.end > start)
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  return phrases.reduce((n, p) => n + (lower.includes(p) ? 1 : 0), 0);
}

/** Parse ffmpeg silencedetect noise regions → prefer loud/active audio. */
async function detectActiveRanges(
  jobId: string,
  videoPath: string,
  duration: number,
): Promise<Array<{ start: number; end: number }>> {
  try {
    const { stderr } = await runCommand(ffmpegPath(), [
      "-i",
      videoPath,
      "-af",
      "silencedetect=noise=-35dB:d=0.6",
      "-f",
      "null",
      "-",
    ]);

    const silences: Array<{ start: number; end: number }> = [];
    const startRe = /silence_start:\s*([\d.]+)/g;
    const endRe = /silence_end:\s*([\d.]+)/g;
    const starts = [...stderr.matchAll(startRe)].map((m) => Number(m[1]));
    const ends = [...stderr.matchAll(endRe)].map((m) => Number(m[1]));

    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
      silences.push({ start: starts[i], end: ends[i] });
    }

    // Invert silences → active speech/music ranges
    const active: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const sil of silences.sort((a, b) => a.start - b.start)) {
      if (sil.start > cursor + 1) {
        active.push({ start: cursor, end: sil.start });
      }
      cursor = Math.max(cursor, sil.end);
    }
    if (cursor < duration - 1) active.push({ start: cursor, end: duration });

    await import("fs/promises").then((fs) =>
      fs.writeFile(
        path.join(jobDir(jobId), "active-ranges.json"),
        JSON.stringify(active, null, 2),
        "utf8",
      ),
    );

    return active.length ? active : [{ start: 0, end: duration }];
  } catch {
    return [{ start: 0, end: duration }];
  }
}

function activeOverlap(
  active: Array<{ start: number; end: number }>,
  start: number,
  end: number,
) {
  let overlap = 0;
  for (const a of active) {
    const s = Math.max(start, a.start);
    const e = Math.min(end, a.end);
    if (e > s) overlap += e - s;
  }
  return overlap / Math.max(end - start, 1);
}

/** When OpenAI is configured, refine / pick viral windows from the transcript. */
async function llmPickClips(opts: {
  videoTitle: string;
  duration: number;
  segments: TranscriptSegment[];
}): Promise<ClipPlan[] | null> {
  if (!hasOpenAiKey()) return null;
  const { videoTitle, duration, segments } = opts;
  if (!segments.length) return null;

  // Compact timed lines so the model sees structure without a huge prompt.
  const lines = segments
    .slice(0, 180)
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n")
    .slice(0, 10_000);

  const { text, usedLlm } = await llmComplete({
    system: `You pick viral short-form clips from a long video transcript.
Return ONLY JSON: {"clips":[{"start":number,"end":number,"title":string,"hook":string,"reason":string,"viralityScore":number}]}
Rules: 2–4 clips; each 40–60s; start/end within 0..${duration.toFixed(1)}; prefer hooks, questions, reveals; titles under 8 words; Arabic or English matching the transcript; no subscribe/CTA windows.`,
    user: `Video title: ${videoTitle}\nDuration: ${duration.toFixed(1)}s\nTranscript:\n${lines}`,
    maxTokens: 900,
    temperature: 0.4,
  });
  if (!usedLlm) return null;

  const parsed = parseLlmJson<{
    clips?: Array<{
      start?: number;
      end?: number;
      title?: string;
      hook?: string;
      reason?: string;
      viralityScore?: number;
    }>;
  }>(text);
  if (!parsed?.clips?.length) return null;

  const usedTitles = new Set<string>();
  const plans: ClipPlan[] = [];
  for (const c of parsed.clips) {
    if (plans.length >= 4) break;
    const rawStart = Number(c.start);
    const rawEnd = Number(c.end);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;
    const { start, end } = clampClip(rawStart, rawEnd, duration, "long");
    if (end - start < 20) continue;
    const overlaps = plans.some((p) => {
      const o = Math.min(p.end, end) - Math.max(p.start, start);
      return o > 18;
    });
    if (overlaps) continue;

    const window = windowText(segments, start, end);
    let title = (c.title || "").trim();
    if (!title || usedTitles.has(title.toLowerCase())) {
      title = topicTitleFromTranscript({
        text: window,
        videoTitle,
        start,
        usedTitles,
      });
    } else {
      usedTitles.add(title.toLowerCase());
    }
    plans.push(
      enrichPlan(
        {
          id: `clip-${plans.length + 1}`,
          title,
          hook: (c.hook || "").trim() || topicHookFromTranscript(window, title),
          start,
          end,
          viralityScore: Math.max(
            55,
            Math.min(98, Math.round(Number(c.viralityScore) || 82)),
          ),
          reason: `AI pick · ${(c.reason || "strong moment").slice(0, 80)}`,
        },
        segments,
        0.8,
        duration,
      ),
    );
  }
  return plans.length ? plans : null;
}

/**
 * Viral picker: OpenAI when configured, else local scoring from transcript + audio.
 */
export async function pickViralClips(opts: {
  jobId: string;
  videoPath: string;
  title: string;
  duration: number;
  segments: TranscriptSegment[];
}): Promise<ClipPlan[]> {
  const { jobId, videoPath, title: videoTitle, duration, segments } = opts;

  if (duration < 2) {
    throw new Error("Video is empty or too short to process.");
  }

  // TikTok / Shorts / uploads under ~40s → one full export (no 40s minimum)
  if (duration < SHORT_SOURCE_MAX) {
    return shortSourcePlans({ duration, segments, videoTitle });
  }

  // Prefer LLM picks when key + transcript exist (falls back to heuristics).
  const llmPlans = await llmPickClips({ videoTitle, duration, segments });
  if (llmPlans?.length) return llmPlans.map((p) => enrichPlan(p, segments, 0.8, duration));

  // Longer sources (YouTube etc.) → 40–60s viral cuts
  const active = await detectActiveRanges(jobId, videoPath, duration);
  const targetLens = [45, 50, 55];
  const step = 6;
  const scored: Array<{
    start: number;
    end: number;
    score: number;
    text: string;
    reason: string;
    quality: ReturnType<typeof scoreClipWindow>;
  }> = [];

  const introGuard = Math.min(12, duration * 0.04);
  const outroGuard = Math.max(duration - 12, duration * 0.92);

  for (const len of targetLens) {
    for (let t = 0; t + len <= duration; t += step) {
      const start = t;
      const end = t + len;
      if (start < introGuard && duration > 90) continue;
      if (end > outroGuard && duration > 90) continue;

      const text = windowText(segments, start, end);
      const overlap = activeOverlap(active, start, end);
      const quality = scoreClipWindow({
        segments,
        start,
        end,
        activeOverlap: overlap,
        duration,
      });
      const dead = countMatches(text, DEAD_WORDS);

      let score =
        quality.viralityScore +
        quality.hookScore * 0.25 +
        quality.retentionScore * 0.2 -
        dead * 12;

      if (!text && overlap < 0.4) score -= 20;

      scored.push({
        start,
        end,
        score,
        text,
        reason: quality.reasons.slice(0, 2).join(" + "),
        quality,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: ClipPlan[] = [];
  const usedTitles = new Set<string>();

  for (const cand of scored) {
    if (picked.length >= 4) break;
    const overlapsExisting = picked.some((p) => {
      const overlap = Math.min(p.end, cand.end) - Math.max(p.start, cand.start);
      return overlap > 18;
    });
    if (overlapsExisting) continue;

    const { start, end } = clampClip(cand.start, cand.end, duration, "long");
    const text = windowText(segments, start, end) || cand.text;
    const clipTitle = topicTitleFromTranscript({
      text,
      videoTitle,
      start,
      usedTitles,
    });

    picked.push(
      enrichPlan(
        {
          id: `clip-${picked.length + 1}`,
          title: clipTitle,
          hook: topicHookFromTranscript(text, clipTitle),
          start,
          end,
          viralityScore: cand.quality.viralityScore,
          reason: `Clippers score · ${cand.reason}`,
        },
        segments,
        activeOverlap(active, start, end),
        duration,
      ),
    );
  }

  if (!picked.length) {
    const count = Math.min(3, Math.max(1, Math.floor(duration / 90)));
    for (let i = 0; i < count; i++) {
      const start = Math.min(
        duration - 45,
        introGuard + i * Math.max(60, duration / count),
      );
      const { start: s, end: e } = clampClip(start, start + 50, duration, "long");
      const text = windowText(segments, s, e);
      const clipTitle = topicTitleFromTranscript({
        text,
        videoTitle,
        start: s,
        usedTitles,
      });
      picked.push(
        enrichPlan(
          {
            id: `clip-${i + 1}`,
            title: clipTitle,
            hook: topicHookFromTranscript(text, clipTitle),
            start: s,
            end: e,
            viralityScore: 72 - i * 4,
            reason: "Clippers fallback · evenly spaced active window",
          },
          segments,
          0.6,
          duration,
        ),
      );
    }
  }

  return picked;
}

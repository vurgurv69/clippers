import path from "path";
import { ffmpegPath, runCommand } from "./binaries";
import { jobDir } from "./jobs";
import { topicHookFromTranscript, topicTitleFromTranscript } from "./topic-title";
import type { ClipPlan, TranscriptSegment } from "./types";

const HOOK_WORDS = [
  "secret",
  "actually",
  "wait",
  "never",
  "always",
  "wrong",
  "mistake",
  "truth",
  "insane",
  "crazy",
  "shocking",
  "because",
  "here's",
  "heres",
  "why",
  "how",
  "stop",
  "don't",
  "dont",
  "nobody",
  "everyone",
  "finally",
  "warning",
  "imagine",
  "what if",
  "the problem",
  "the reason",
  "listen",
  "check this",
  "watch this",
  "game changer",
  "pro tip",
  // Arabic hooks
  "سر",
  "انتظر",
  "لما",
  "لماذا",
  "حقيقة",
  "مستحيل",
  "شوف",
  "انظر",
  "مهم",
  "صدق",
];

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
const SHORT_SOURCE_MAX = 40; // under this → export whole video / short windows

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
    {
      id: "clip-1",
      title: clipTitle,
      hook: topicHookFromTranscript(text, clipTitle),
      start,
      end,
      viralityScore: 88,
      reason: "Short source · full video export (under 40s)",
    },
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

function speechDensity(
  segments: TranscriptSegment[],
  start: number,
  end: number,
) {
  const words = segments
    .flatMap((s) => s.words)
    .filter((w) => w.start >= start && w.end <= end);
  const duration = Math.max(end - start, 1);
  return words.length / duration;
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

/**
 * Clippers' own viral picker — no ChatGPT.
 * Scores windows, then titles each clip from what is actually said.
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

  // Longer sources (YouTube etc.) → 40–60s viral cuts
  const active = await detectActiveRanges(jobId, videoPath, duration);
  const targetLens = [45, 50, 55];
  const step = 8;
  const scored: Array<{
    start: number;
    end: number;
    score: number;
    text: string;
    reason: string;
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
      const density = speechDensity(segments, start, end);
      const hooks = countMatches(text, HOOK_WORDS);
      const dead = countMatches(text, DEAD_WORDS);
      const questions = (text.match(/\?/g) || []).length;
      const overlap = activeOverlap(active, start, end);
      const earlyHookBoost =
        countMatches(windowText(segments, start, start + 3), HOOK_WORDS) * 8;

      // Weighted "will this get views?" score — our own model
      let score =
        density * 14 +
        hooks * 10 +
        questions * 6 +
        overlap * 25 +
        earlyHookBoost -
        dead * 18;

      // Prefer mid-video energy on long uploads
      const mid = duration / 2;
      const dist = Math.abs((start + end) / 2 - mid) / mid;
      score += (1 - dist) * 8;

      if (!text && overlap < 0.4) score -= 20;

      const reasons: string[] = [];
      if (hooks) reasons.push("hook language");
      if (density > 2.2) reasons.push("fast dialogue");
      if (questions) reasons.push("curiosity beats");
      if (overlap > 0.75) reasons.push("loud/active audio");
      if (!reasons.length) reasons.push("strong activity window");

      scored.push({
        start,
        end,
        score,
        text,
        reason: reasons.slice(0, 2).join(" + "),
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
    // Use THIS clip's window text only (not the whole video)
    const text = windowText(segments, start, end) || cand.text;
    const viralityScore = Math.max(
      55,
      Math.min(98, Math.round(60 + cand.score / 3)),
    );
    const clipTitle = topicTitleFromTranscript({
      text,
      videoTitle,
      start,
      usedTitles,
    });

    picked.push({
      id: `clip-${picked.length + 1}`,
      title: clipTitle,
      hook: topicHookFromTranscript(text, clipTitle),
      start,
      end,
      viralityScore,
      reason: `Clippers score · ${cand.reason}`,
    });
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
      picked.push({
        id: `clip-${i + 1}`,
        title: clipTitle,
        hook: topicHookFromTranscript(text, clipTitle),
        start: s,
        end: e,
        viralityScore: 72 - i * 4,
        reason: "Clippers fallback · evenly spaced active window",
      });
    }
  }

  return picked;
}

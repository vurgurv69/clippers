import fs from "fs/promises";
import path from "path";
import { computeRmsWindows, meanRms } from "./audio-energy";
import { ffmpegPath, runCommand } from "./binaries";
import { buildSocialPack, scoreClipWindow } from "./clip-quality";
import { jobDir } from "./jobs";
import {
  detectScriptLanguage,
  topicHookFromTranscript,
  topicTitleFromTranscript,
} from "./topic-title";
import type { ClipPlan, TranscriptSegment, TranscriptWord } from "./types";

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

/** Evenly spaced windows that always return exactly `clipCount` plans. */
function spacedPlans(opts: {
  duration: number;
  segments: TranscriptSegment[];
  videoTitle: string;
  clipCount: number;
  usedTitles?: Set<string>;
  minLen: number;
  maxLen: number;
  reason: string;
}): ClipPlan[] {
  const {
    duration,
    segments,
    videoTitle,
    clipCount,
    minLen,
    maxLen,
    reason,
  } = opts;
  const usedTitles = opts.usedTitles || new Set<string>();
  const n = Math.max(1, clipCount);
  const targetLen = Math.min(
    maxLen,
    Math.max(minLen, Math.min(duration, duration / Math.max(n * 0.85, 1))),
  );
  const span = Math.max(0, duration - targetLen);
  const step = n <= 1 ? 0 : span / (n - 1);
  const out: ClipPlan[] = [];

  for (let i = 0; i < n; i++) {
    const rawStart = n === 1 ? 0 : i * step;
    const snapped = snapToSentenceBounds(
      rawStart,
      rawStart + targetLen,
      segments,
      duration,
      { minLen, maxLen },
    );
    let start = Number(Math.max(0, snapped.start).toFixed(2));
    let end = Number(Math.min(duration, snapped.end).toFixed(2));
    if (end - start < Math.min(minLen, duration * 0.5)) {
      start = Number(Math.max(0, Math.min(duration - 0.5, rawStart)).toFixed(2));
      end = Number(Math.min(duration, start + targetLen).toFixed(2));
    }
    if (end <= start) {
      start = 0;
      end = Number(duration.toFixed(2));
    }
    const text = windowText(segments, start, end);
    const clipTitle = topicTitleFromTranscript({
      text,
      videoTitle,
      start,
      usedTitles,
    });
    out.push(
      enrichPlan(
        {
          id: `clip-${i + 1}`,
          title: clipTitle,
          hook: topicHookFromTranscript(text, clipTitle),
          start,
          end,
          viralityScore: Math.max(55, 90 - i * 3),
          reason,
        },
        segments,
        0.7,
        duration,
      ),
    );
  }
  return out;
}

function shortSourcePlans(opts: {
  duration: number;
  segments: TranscriptSegment[];
  videoTitle: string;
  clipCount: number;
}): ClipPlan[] {
  const { duration, segments, videoTitle, clipCount } = opts;
  const usedTitles = new Set<string>();

  // Too short to split meaningfully — still return exactly 1 plan.
  if (clipCount <= 1 || duration < 4) {
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
          reason: "Short source · full video export",
        },
        segments,
        0.85,
        duration,
      ),
    ];
  }

  const minLen = Math.max(2, Math.min(14, duration / Math.max(clipCount, 1)));
  const maxLen = Math.max(minLen + 1, Math.min(28, duration * 0.7));
  const spaced = spacedPlans({
    duration,
    segments,
    videoTitle,
    clipCount,
    usedTitles,
    minLen,
    maxLen,
    reason: "Short source · evenly spaced cuts",
  });
  return fulfillExactClipCount({
    picked: spaced,
    clipCount,
    duration,
    segments,
    videoTitle,
    usedTitles,
    minLen,
    maxLen,
  });
}

function overlapsTooMuch(
  a: { start: number; end: number },
  b: { start: number; end: number },
  maxOverlapSec: number,
) {
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return overlap > maxOverlapSec;
}

/** Guarantee exactly `clipCount` plans — pad with spaced windows if scoring undershoots. */
function fulfillExactClipCount(opts: {
  picked: ClipPlan[];
  clipCount: number;
  duration: number;
  segments: TranscriptSegment[];
  videoTitle: string;
  usedTitles: Set<string>;
  minLen: number;
  maxLen: number;
}): ClipPlan[] {
  const { clipCount, duration, segments, videoTitle, usedTitles, minLen, maxLen } =
    opts;
  const picked = [...opts.picked];

  if (picked.length >= clipCount) {
    return picked.slice(0, clipCount).map((p, i) => ({ ...p, id: `clip-${i + 1}` }));
  }

  const fillers = spacedPlans({
    duration,
    segments,
    videoTitle,
    clipCount,
    usedTitles,
    minLen,
    maxLen,
    reason: "Clippers · filled to requested count",
  });

  for (const fill of fillers) {
    if (picked.length >= clipCount) break;
    const conflict = picked.some((p) =>
      overlapsTooMuch(p, fill, Math.max(4, (fill.end - fill.start) * 0.45)),
    );
    if (conflict && picked.length > 0) continue;
    picked.push({ ...fill, id: `clip-${picked.length + 1}` });
  }

  // Last resort: accept overlaps so the user always gets N exports.
  if (picked.length < clipCount) {
    for (const fill of fillers) {
      if (picked.length >= clipCount) break;
      if (picked.some((p) => Math.abs(p.start - fill.start) < 0.5)) continue;
      picked.push({ ...fill, id: `clip-${picked.length + 1}` });
    }
  }

  while (picked.length < clipCount) {
    const i = picked.length;
    const len = Math.min(maxLen, Math.max(minLen, duration / clipCount));
    const start = Number(
      Math.min(Math.max(0, duration - len), (i / clipCount) * Math.max(0, duration - len)).toFixed(
        2,
      ),
    );
    const end = Number(Math.min(duration, start + len).toFixed(2));
    const text = windowText(segments, start, end);
    const clipTitle = topicTitleFromTranscript({
      text,
      videoTitle,
      start,
      usedTitles,
    });
    picked.push(
      enrichPlan(
        {
          id: `clip-${i + 1}`,
          title: clipTitle,
          hook: topicHookFromTranscript(text, clipTitle),
          start,
          end,
          viralityScore: Math.max(50, 80 - i * 4),
          reason: "Clippers · count pad",
        },
        segments,
        0.55,
        duration,
      ),
    );
  }

  return picked.slice(0, clipCount).map((p, i) => ({ ...p, id: `clip-${i + 1}` }));
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

function allWords(segments: TranscriptSegment[]): TranscriptWord[] {
  return segments
    .flatMap((s) => (s.words?.length ? s.words : []))
    .filter((w) => w.word.trim())
    .sort((a, b) => a.start - b.start);
}

function isSentenceEnd(word: string) {
  return /[.!?؟۔…]$/.test(word.trim());
}

/**
 * Snap a raw window onto Whisper word end-times so clips start and end
 * on complete sentences (no mid-clause cuts).
 */
export function snapToSentenceBounds(
  start: number,
  end: number,
  segments: TranscriptSegment[],
  duration: number,
  opts?: { minLen?: number; maxLen?: number; slack?: number },
): { start: number; end: number } {
  const minLen = opts?.minLen ?? 8;
  const maxLen = opts?.maxLen ?? 60;
  const slack = opts?.slack ?? 8;
  const words = allWords(segments);
  if (!words.length) {
    const s = Math.max(0, start);
    const e = Math.min(duration, Math.max(s + minLen, end));
    return { start: Number(s.toFixed(2)), end: Number(e.toFixed(2)) };
  }

  const sentenceStarts: number[] = [words[0].start];
  const sentenceEnds: number[] = [];
  for (let i = 0; i < words.length; i++) {
    if (isSentenceEnd(words[i].word) || i === words.length - 1) {
      sentenceEnds.push(words[i].end);
      if (i + 1 < words.length) sentenceStarts.push(words[i + 1].start);
    }
  }
  if (!sentenceEnds.length) sentenceEnds.push(words[words.length - 1].end);

  const starts = sentenceStarts.filter((t) => t <= start + slack && t >= start - slack);
  let s =
    starts.sort((a, b) => Math.abs(a - start) - Math.abs(b - start))[0] ??
    sentenceStarts.reduce((best, t) => (t <= start && t > best ? t : best), words[0].start);

  const ends = sentenceEnds.filter((t) => t >= end - slack && t <= end + slack);
  let e =
    ends.sort((a, b) => Math.abs(a - end) - Math.abs(b - end))[0] ??
    sentenceEnds.reduce((best, t) => (t >= end && t < best ? t : best), words[words.length - 1].end);

  if (e <= s) e = Math.min(duration, s + minLen);
  if (e - s > maxLen) {
    const cap = sentenceEnds.find((t) => t > s && t - s >= minLen && t - s <= maxLen);
    e = cap ?? s + maxLen;
  }
  if (e - s < minLen) {
    const grow = sentenceEnds.find((t) => t - s >= minLen);
    e = grow ?? Math.min(duration, s + minLen);
  }

  s = Math.max(0, s);
  e = Math.min(duration, e);
  return { start: Number(s.toFixed(2)), end: Number(e.toFixed(2)) };
}

function wordDensity(
  segments: TranscriptSegment[],
  start: number,
  end: number,
) {
  const n = allWords(segments).filter((w) => w.end > start && w.start < end).length;
  return n / Math.max(end - start, 1);
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

/**
 * Viral picker: local heuristics only (transcript density, RMS energy, active ranges).
 */
export async function pickViralClips(opts: {
  jobId: string;
  videoPath: string;
  title: string;
  duration: number;
  segments: TranscriptSegment[];
  clipCount?: number;
}): Promise<ClipPlan[]> {
  const { jobId, videoPath, title: videoTitle, duration, segments } = opts;
  const clipCount = Math.max(1, Math.min(10, Math.round(opts.clipCount || 4)));

  if (duration < 2) {
    throw new Error("Video is empty or too short to process.");
  }

  // Short sources: still honor clipCount when the file is long enough to split.
  if (duration < SHORT_SOURCE_MAX) {
    return shortSourcePlans({ duration, segments, videoTitle, clipCount });
  }

  // Adaptive window length so N clips can fit the source.
  const fitLen = Math.max(
    12,
    Math.min(LONG_CLIP_MAX, Math.floor(duration / Math.max(clipCount, 1))),
  );
  const minLen = Math.max(12, Math.min(LONG_CLIP_MIN, fitLen));
  const maxLen = Math.max(minLen + 4, Math.min(LONG_CLIP_MAX, fitLen + 10));

  const active = await detectActiveRanges(jobId, videoPath, duration);
  let rms: Array<{ t: number; rms: number }> = [];
  try {
    const wav = path.join(jobDir(jobId), "audio.wav");
    await fs.access(wav);
    rms = await computeRmsWindows(wav, 0.5);
  } catch {
    rms = [];
  }
  const peakRms = Math.max(...rms.map((r) => r.rms), 0.0001);

  const targetLens = Array.from(
    new Set([
      minLen,
      Math.round((minLen + maxLen) / 2),
      maxLen,
      Math.min(55, maxLen),
    ]),
  ).filter((n) => n >= 8 && n <= duration);
  const step = Math.max(3, Math.min(8, Math.floor(minLen / 6)));
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
      const snapped = snapToSentenceBounds(t, t + len, segments, duration, {
        minLen,
        maxLen,
      });
      const start = snapped.start;
      const end = snapped.end;
      if (start < introGuard && duration > 90) continue;
      if (end > outroGuard && duration > 90) continue;

      const text = windowText(segments, start, end);
      const overlap = activeOverlap(active, start, end);
      const density = wordDensity(segments, start, end);
      const energy = rms.length ? meanRms(rms, start, end) / peakRms : overlap;
      const quality = scoreClipWindow({
        segments,
        start,
        end,
        activeOverlap: overlap,
        duration,
      });
      const dead = countMatches(text, DEAD_WORDS);

      let score =
        energy * 45 +
        Math.min(density / 2.4, 1) * 40 +
        quality.hookScore * 0.15 +
        quality.viralityScore * 0.08 -
        dead * 14;

      if (density < 0.6) score -= 18;
      if (!text && overlap < 0.4) score -= 20;

      scored.push({
        start,
        end,
        score,
        text,
        reason:
          rms.length
            ? `energy ${energy.toFixed(2)} + ${density.toFixed(1)} w/s`
            : quality.reasons.slice(0, 2).join(" + "),
        quality,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: ClipPlan[] = [];
  const usedTitles = new Set<string>();
  // Relax overlap caps across passes so we can still reach clipCount.
  const overlapCaps = [
    Math.max(6, minLen * 0.35),
    Math.max(4, minLen * 0.5),
    Math.max(2, minLen * 0.65),
  ];

  for (const maxOverlap of overlapCaps) {
    if (picked.length >= clipCount) break;
    for (const cand of scored) {
      if (picked.length >= clipCount) break;
      if (picked.some((p) => overlapsTooMuch(p, cand, maxOverlap))) continue;

      const snapped = snapToSentenceBounds(cand.start, cand.end, segments, duration, {
        minLen,
        maxLen,
      });
      let start = snapped.start;
      let end = snapped.end;
      // Prefer adaptive clamp over hard 40–60 when fitting many clips.
      if (end - start < minLen || end - start > maxLen) {
        const mid = (start + end) / 2;
        start = Math.max(0, mid - minLen / 2);
        end = Math.min(duration, start + Math.min(maxLen, Math.max(minLen, end - start)));
      }
      start = Number(start.toFixed(2));
      end = Number(end.toFixed(2));
      if (end <= start) continue;

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
  }

  return fulfillExactClipCount({
    picked,
    clipCount,
    duration,
    segments,
    videoTitle,
    usedTitles,
    minLen,
    maxLen,
  });
}

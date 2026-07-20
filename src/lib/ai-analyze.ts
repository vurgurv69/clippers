/**
 * Heuristic AI analyze: markers + viral scorecard from transcript / timeline meta.
 * Optional LLM labeling when OPENAI_API_KEY is set.
 */

import { topicTitleFromTranscript } from "./topic-title";
import { llmComplete, parseLlmJson } from "./llm";
import type { TranscriptSegment } from "./types";
import {
  AI_MARKER_META,
  type AiMarkerKind,
  type AiSuggestion,
  type GrowthPack,
  type GrowthTitles,
  type HookFixId,
  type ViralScorecard,
} from "./growth-types";

const HOOK_WORDS = [
  "secret", "actually", "wait", "never", "always", "wrong", "mistake", "truth",
  "insane", "crazy", "shocking", "because", "here's", "heres", "why", "how",
  "stop", "don't", "dont", "nobody", "everyone", "finally", "warning", "imagine",
  "what if", "the problem", "the reason", "listen", "check this", "watch this",
  "game changer", "pro tip", "سر", "انتظر", "لما", "لماذا", "حقيقة", "مستحيل",
  "شوف", "انظر", "مهم", "صدق",
];

const FUNNY_WORDS = [
  "lol", "haha", "funny", "joke", "hilarious", "bro", "dude", "wait what",
  "no way", "💀", "😂", "هههه", "اضحك",
];

const CTA_WORDS = [
  "subscribe", "follow", "comment", "like", "share", "click", "link in bio",
  "download", "sign up", "اشترك", "تابع", "علق",
];

const TIP_WORDS = [
  "tip", "hack", "trick", "lesson", "remember", "pro tip", "rule", "always",
  "never", "نصيحة", "خدعة",
];

const QUESTION_RE = /\?|لماذا|كيف|هل |what |why |how |when |who /i;
const EMOTIONAL_WORDS = [
  "love", "hate", "cry", "tears", "scared", "afraid", "proud", "sorry",
  "heartbroken", "حب", "حزن", "خوف", "فخر",
];
const STORY_WORDS = [
  "story", "once", "then", "suddenly", "years ago", "remember when",
  "قصة", "فجأة", "قبل",
];
const FILLER_WORDS = [
  "um", "uh", "like", "you know", "basically", "literally", "i mean",
  "sort of", "kind of", "يعني", "اه", "ام",
];

export type AnalyzeInput = {
  duration: number;
  videoTitle?: string;
  transcriptText?: string;
  segments?: TranscriptSegment[];
  hasCaptions?: boolean;
  hasMusic?: boolean;
  clipCount?: number;
  /** Loud/active ranges from ffmpeg silencedetect (optional). */
  activeRanges?: { start: number; end: number }[];
  /** Silence gaps from ffmpeg (optional). */
  silenceRanges?: { start: number; end: number }[];
};

function countMatches(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const w of words) {
    if (lower.includes(w.toLowerCase())) n += 1;
  }
  return n;
}

function windowText(
  segments: TranscriptSegment[] | undefined,
  start: number,
  end: number,
  fallback = "",
): string {
  if (!segments?.length) {
    if (!fallback) return "";
    // Approximate slice of flat text by duration ratio
    const len = fallback.length;
    if (!len || end <= start) return fallback.slice(0, 200);
    const ratio = start / Math.max(end, 1);
    const i0 = Math.floor(ratio * len);
    return fallback.slice(i0, i0 + 280);
  }
  return segments
    .filter((s) => s.end > start && s.start < end)
    .map((s) => s.text)
    .join(" ")
    .trim();
}

function speechDensity(
  segments: TranscriptSegment[] | undefined,
  start: number,
  end: number,
): number {
  if (!segments?.length) return 1.5;
  let spoken = 0;
  for (const s of segments) {
    const a = Math.max(s.start, start);
    const b = Math.min(s.end, end);
    if (b > a) spoken += b - a;
  }
  const span = Math.max(0.1, end - start);
  return spoken / span;
}

function silenceGaps(
  segments: TranscriptSegment[] | undefined,
  duration: number,
): { start: number; end: number }[] {
  if (!segments?.length || duration < 2) return [];
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  for (const s of sorted) {
    if (s.start - cursor >= 1.2) {
      gaps.push({ start: cursor, end: s.start });
    }
    cursor = Math.max(cursor, s.end);
  }
  if (duration - cursor >= 1.2) gaps.push({ start: cursor, end: duration });
  return gaps.filter((g) => g.end - g.start >= 1.2 && g.end - g.start < 8);
}

function classifyWindow(text: string, density: number, t: number): {
  kind: AiMarkerKind;
  score: number;
  reason: string;
} | null {
  const hooks = countMatches(text, HOOK_WORDS);
  const funny = countMatches(text, FUNNY_WORDS);
  const cta = countMatches(text, CTA_WORDS);
  const tip = countMatches(text, TIP_WORDS);
  const emo = countMatches(text, EMOTIONAL_WORDS);
  const story = countMatches(text, STORY_WORDS);
  const q = QUESTION_RE.test(text) ? 1 : 0;

  if (t < 5 && hooks >= 1) {
    return { kind: "hook", score: 70 + hooks * 8, reason: "Strong hook language in opening" };
  }
  if (hooks >= 2) {
    return { kind: "viral", score: 65 + hooks * 6 + density * 8, reason: "Hook language + density" };
  }
  if (funny >= 1) {
    return { kind: "funny", score: 60 + funny * 10, reason: "Humor / reaction beat" };
  }
  if (emo >= 1) {
    return { kind: "emotional", score: 58 + emo * 10, reason: "Emotional language" };
  }
  if (q) {
    return { kind: "question", score: 62 + density * 5, reason: "Curiosity question" };
  }
  if (story >= 1) {
    return { kind: "story", score: 55 + story * 8, reason: "Story beat" };
  }
  if (tip >= 1) {
    return { kind: "tip", score: 58 + tip * 8, reason: "Actionable tip" };
  }
  if (cta >= 1) {
    return { kind: "cta", score: 50 + cta * 6, reason: "Call to action" };
  }
  if (density > 2.4) {
    return { kind: "energy", score: 55 + density * 10, reason: "Fast dialogue / high energy" };
  }
  if (hooks >= 1) {
    return { kind: "hook", score: 58 + hooks * 5, reason: "Hook phrase" };
  }
  if (density > 1.8 && text.length > 40) {
    return { kind: "viral", score: 52 + density * 6, reason: "Solid retention window" };
  }
  return null;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function activeOverlap(
  active: { start: number; end: number }[],
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

/** Build AI suggestions + scorecard from heuristics (always). */
export function analyzeHeuristics(input: AnalyzeInput): {
  suggestions: AiSuggestion[];
  score: ViralScorecard;
} {
  const duration = Math.max(0.5, input.duration || 30);
  const title = input.videoTitle || "Clip";
  const segments = input.segments;
  const flat =
    input.transcriptText ||
    (segments?.map((s) => s.text).join(" ") ?? "");

  const suggestions: AiSuggestion[] = [];
  const win = Math.min(12, Math.max(6, duration / 6));
  const step = Math.max(3, win * 0.45);

  for (let t = 0; t + 3 <= duration; t += step) {
    const start = Number(t.toFixed(2));
    const end = Number(Math.min(duration, t + win).toFixed(2));
    const text = windowText(segments, start, end, flat);
    let density = speechDensity(segments, start, end);
    if (input.activeRanges?.length) {
      const overlap = activeOverlap(input.activeRanges, start, end);
      density = Math.max(density, overlap * 2.5);
    }
    const hit = classifyWindow(text, density, start);
    if (!hit) continue;
    // Boost score when window overlaps loud audio
    if (input.activeRanges?.length) {
      const ov = activeOverlap(input.activeRanges, start, end);
      if (ov > 0.7 && hit.kind !== "silence") {
        hit.score = Math.min(98, hit.score + 8);
        if (ov > 0.85 && hit.kind === "viral") hit.reason += " + loud energy";
      }
    }
    const meta = AI_MARKER_META[hit.kind];
    suggestions.push({
      id: uid("sug"),
      kind: hit.kind,
      start,
      end,
      label: `${meta.emoji} ${meta.label}`,
      emoji: meta.emoji,
      reason: hit.reason,
      score: Math.min(98, Math.round(hit.score)),
    });
  }

  const ffmpegSilences = (input.silenceRanges || []).filter(
    (g) => g.end - g.start >= 1.0,
  );
  const gapList =
    ffmpegSilences.length > 0
      ? ffmpegSilences
      : silenceGaps(segments, duration);

  for (const g of gapList.slice(0, 5)) {
    const meta = AI_MARKER_META.silence;
    suggestions.push({
      id: uid("sil"),
      kind: "silence",
      start: Number(g.start.toFixed(2)),
      end: Number(g.end.toFixed(2)),
      label: `${meta.emoji} ${meta.label}`,
      emoji: meta.emoji,
      reason: "Long silence — trim candidate",
      score: 40,
    });
  }

  // High-energy peaks from active ranges (even without transcript)
  if (input.activeRanges?.length) {
    const top = [...input.activeRanges]
      .map((r) => ({ ...r, len: r.end - r.start }))
      .filter((r) => r.len >= 3 && r.len <= 40)
      .sort((a, b) => b.len - a.len)
      .slice(0, 3);
    for (const r of top) {
      if (suggestions.some((s) => s.kind === "energy" && Math.abs(s.start - r.start) < 4))
        continue;
      const meta = AI_MARKER_META.energy;
      suggestions.push({
        id: uid("en"),
        kind: "energy",
        start: Number(r.start.toFixed(2)),
        end: Number(Math.min(duration, r.start + Math.min(12, r.len)).toFixed(2)),
        label: `${meta.emoji} ${meta.label}`,
        emoji: meta.emoji,
        reason: "Loud / active audio peak",
        score: 68,
      });
    }
  }

  // Always ensure an opening hook marker
  if (!suggestions.some((s) => s.kind === "hook" && s.start < 6)) {
    const meta = AI_MARKER_META.hook;
    const openText = windowText(segments, 0, Math.min(5, duration), flat);
    const weak = countMatches(openText, HOOK_WORDS) === 0;
    suggestions.unshift({
      id: uid("hook"),
      kind: weak ? "surprise" : "hook",
      start: 0,
      end: Number(Math.min(5, duration).toFixed(2)),
      label: weak
        ? `${AI_MARKER_META.surprise.emoji} Weak opening`
        : `${meta.emoji} ${meta.label}`,
      emoji: weak ? AI_MARKER_META.surprise.emoji : meta.emoji,
      reason: weak
        ? "First 5s lack hook language — strengthen opening"
        : "Opening window",
      score: weak ? 45 : 72,
    });
  }

  // Dedupe overlapping same-kind
  suggestions.sort((a, b) => b.score - a.score);
  const kept: AiSuggestion[] = [];
  for (const s of suggestions) {
    const clash = kept.some(
      (k) =>
        k.kind === s.kind &&
        Math.min(k.end, s.end) - Math.max(k.start, s.start) > 2,
    );
    if (!clash) kept.push(s);
    if (kept.length >= 14) break;
  }
  kept.sort((a, b) => a.start - b.start);

  const score = buildScorecard({
    duration,
    flat,
    segments,
    suggestions: kept,
    hasCaptions: Boolean(input.hasCaptions),
    hasMusic: Boolean(input.hasMusic),
    clipCount: input.clipCount ?? 1,
    title,
  });

  return { suggestions: kept, score };
}

function buildScorecard(opts: {
  duration: number;
  flat: string;
  segments?: TranscriptSegment[];
  suggestions: AiSuggestion[];
  hasCaptions: boolean;
  hasMusic: boolean;
  clipCount: number;
  title: string;
}): ViralScorecard {
  const { duration, flat, segments, suggestions, hasCaptions, hasMusic, clipCount } =
    opts;
  const open = windowText(segments, 0, Math.min(5, duration), flat);
  const hooks = countMatches(open, HOOK_WORDS);
  const dens = speechDensity(segments, 0, Math.min(duration, 30));
  const q = (flat.match(/\?/g) || []).length;
  const fillers = countMatches(flat, FILLER_WORDS);
  const viralMarks = suggestions.filter((s) =>
    ["hook", "viral", "energy", "funny", "question"].includes(s.kind),
  ).length;

  const hook = Math.min(98, 35 + hooks * 18 + (open.length > 20 ? 10 : 0));
  const pacing = Math.min(
    98,
    40 + dens * 18 + Math.min(15, clipCount * 4) - Math.min(20, fillers * 4),
  );
  const engagement = Math.min(98, 42 + q * 6 + viralMarks * 5);
  const subtitles = hasCaptions ? 82 : 38;
  const visual = Math.min(90, 50 + (hasMusic ? 12 : 0) + Math.min(20, clipCount * 3));
  const virality = Math.min(
    98,
    Math.round((hook * 0.35 + pacing * 0.25 + engagement * 0.25 + visual * 0.15)),
  );
  const retention = Math.min(
    95,
    Math.round(40 + dens * 15 + (hook > 60 ? 12 : 0) + (hasCaptions ? 10 : 0)),
  );
  const overall = Math.round(
    virality * 0.28 +
      engagement * 0.18 +
      pacing * 0.14 +
      hook * 0.18 +
      subtitles * 0.08 +
      visual * 0.06 +
      retention * 0.08,
  );

  const reasons: string[] = [];
  if (hooks) reasons.push("Opening has hook language");
  else reasons.push("Opening hook is weak — punch in captions or zoom");
  if (dens > 2) reasons.push("Good speech density");
  if (hasCaptions) reasons.push("Captions present");
  else reasons.push("Add captions for retention");
  if (hasMusic) reasons.push("Music bed helps pacing");
  if (fillers >= 3) reasons.push("Filler words detected — clean up");
  if (viralMarks >= 3) reasons.push("Multiple high-retention moments");

  const hookWeak = hook < 62;
  const hookFixes: HookFixId[] = hookWeak
    ? ["zoom", "captions", "punch", "music", "transition"]
    : hooks < 2
      ? ["captions", "zoom"]
      : [];

  const bestPlatforms =
    duration <= 60
      ? ["TikTok", "Reels", "Shorts"]
      : duration <= 180
        ? ["YouTube Shorts", "Reels", "TikTok"]
        : ["YouTube", "LinkedIn", "X"];

  const dow = new Date().getDay();
  const suggestedPostTime =
    dow === 0 || dow === 6
      ? "Sat–Sun 10:00–12:00 local"
      : "Tue–Thu 18:00–20:00 local";

  // Predicted drop-off curve (heuristic): start 100%, decay by pacing/hook/captions
  const retentionCurve: { t: number; pct: number }[] = [];
  const baseDrop = 100 - retention;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const earlyBoost = hook > 70 ? 0.85 : 1.05;
    const captionHold = hasCaptions ? 0.92 : 1.08;
    const pct = Math.max(
      8,
      Math.round(100 - baseDrop * Math.pow(t, 0.85) * earlyBoost * captionHold - t * t * 12),
    );
    retentionCurve.push({ t, pct: Math.min(100, pct) });
  }

  const improvements: string[] = [];
  if (hookWeak) improvements.push("Strengthen the first 3 seconds");
  if (!hasCaptions) improvements.push("Burn captions for mobile retention");
  if (fillers >= 2) improvements.push("Trim silence / filler words");
  if (!hasMusic) improvements.push("Add a ducked music bed");
  if (clipCount < 2 && duration > 20) improvements.push("Cut into more beats");
  if (visual < 60) improvements.push("Punch-in / reframe talking head");

  const estimatedCtrPct = Math.min(
    18,
    Math.round(3 + (hook / 100) * 6 + (hasCaptions ? 2 : 0) + (viralMarks > 0 ? 2 : 0)),
  );

  return {
    overall: Math.max(32, Math.min(98, overall)),
    virality: Math.round(virality),
    engagement: Math.round(engagement),
    pacing: Math.round(pacing),
    hook: Math.round(hook),
    subtitles: Math.round(subtitles),
    visual: Math.round(visual),
    retention: Math.round(retention),
    reasons: reasons.slice(0, 5),
    bestPlatforms,
    estimatedRetentionPct: Math.round(retention * 0.85),
    suggestedPostTime,
    hookWeak,
    hookFixes,
    retentionCurve,
    improvements: improvements.slice(0, 5),
    estimatedCtrPct,
  };
}

/** Optionally refine suggestion labels via LLM. */
export async function refineSuggestionsWithLlm(
  suggestions: AiSuggestion[],
  transcriptSnippet: string,
): Promise<{ suggestions: AiSuggestion[]; usedLlm: boolean }> {
  if (!suggestions.length || !transcriptSnippet.trim()) {
    return { suggestions, usedLlm: false };
  }
  const { text, usedLlm } = await llmComplete({
    system:
      "You label short-form video moments. Reply JSON only: {\"labels\":[{\"id\":\"...\",\"label\":\"emoji + short name\",\"reason\":\"one sentence\"}]}",
    user: `Transcript excerpt:\n${transcriptSnippet.slice(0, 2500)}\n\nMoments:\n${JSON.stringify(
      suggestions.map((s) => ({ id: s.id, kind: s.kind, start: s.start, end: s.end })),
    )}`,
    maxTokens: 600,
    temperature: 0.4,
  });
  if (!usedLlm) return { suggestions, usedLlm: false };
  const parsed = parseLlmJson<{ labels?: { id: string; label: string; reason: string }[] }>(
    text,
  );
  if (!parsed?.labels?.length) return { suggestions, usedLlm: false };
  const map = new Map(parsed.labels.map((l) => [l.id, l]));
  return {
    usedLlm: true,
    suggestions: suggestions.map((s) => {
      const l = map.get(s.id);
      if (!l) return s;
      return {
        ...s,
        label: l.label || s.label,
        reason: l.reason || s.reason,
      };
    }),
  };
}

function heuristicTitles(snippet: string, videoTitle: string): GrowthTitles {
  const used = new Set<string>();
  const mk = (n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = topicTitleFromTranscript({
        text: snippet || videoTitle,
        videoTitle,
        start: i * 7,
        usedTitles: used,
      });
      out.push(t);
    }
    return out;
  };
  const base = mk(10);
  return {
    youtube: base.map((t, i) => (i % 2 === 0 ? t : `${t} (explained)`)).slice(0, 10),
    tiktok: base.map((t) => (t.length > 60 ? t.slice(0, 57) + "…" : t)).slice(0, 10),
    instagram: base.map((t, i) => `${t}${i % 3 === 0 ? " ✨" : ""}`).slice(0, 10),
    shorts: base.map((t) => t.replace(/\(explained\)/gi, "").trim()).slice(0, 10),
    linkedin: base
      .map((t, i) => (i % 2 === 0 ? `${t} — key takeaways` : `Lesson: ${t}`))
      .slice(0, 8),
    x: base.map((t) => (t.length > 100 ? t.slice(0, 97) + "…" : t)).slice(0, 8),
  };
}

function heuristicHashtags(snippet: string): Record<string, string[]> {
  const words = snippet
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 8);
  const core = Array.from(new Set(words)).slice(0, 5).map((w) => `#${w}`);
  const common = ["#fyp", "#viral", "#clippers", "#shorts", "#reels"];
  // Niche “trending” packs (static, rotated by weekday)
  const trendingPools = [
    ["#growth", "#creator", "#tips", "#learnontiktok"],
    ["#business", "#mindset", "#entrepreneur", "#sidehustle"],
    ["#tech", "#ai", "#productivity", "#buildinpublic"],
    ["#storytime", "#relatable", "#lifehack", "#didyouknow"],
  ];
  const trending = trendingPools[new Date().getDay() % trendingPools.length];
  return {
    tiktok: [...core, ...trending, ...common].slice(0, 10),
    youtube: [...core, "#shorts", "#youtubeshorts", trending[0]].slice(0, 8),
    instagram: [...core, "#reels", "#explore", trending[1]].slice(0, 8),
    shorts: [...core, "#shorts", trending[2]].slice(0, 6),
    linkedin: [...core, "#leadership", "#learning", "#career", trending[0]].slice(0, 6),
    x: [...core, "#buildinpublic", "#tips", trending[2]].slice(0, 6),
  };
}

/** Build a Growth Pack (heuristics + optional LLM). */
export async function buildGrowthPack(opts: {
  duration: number;
  videoTitle?: string;
  transcriptSnippet?: string;
  score?: ViralScorecard;
}): Promise<{ pack: GrowthPack; usedLlm: boolean }> {
  const title = opts.videoTitle || "Untitled clip";
  const snippet = opts.transcriptSnippet || title;
  const analyzed =
    opts.score ||
    analyzeHeuristics({
      duration: opts.duration,
      videoTitle: title,
      transcriptText: snippet,
      hasCaptions: true,
    }).score;

  let titles = heuristicTitles(snippet, title);
  let description = `${snippet.slice(0, 180).trim()}${snippet.length > 180 ? "…" : ""}\n\n${analyzed.reasons[0] || "Watch till the end."}`;
  let cta = "Follow for more — drop a comment if this helped.";
  let hashtags = heuristicHashtags(snippet);
  let usedLlm = false;

  const llm = await llmComplete({
    system:
      'You write short-form growth copy. Reply JSON only: {"youtube":["..."],"tiktok":["..."],"instagram":["..."],"shorts":["..."],"linkedin":["..."],"x":["..."],"description":"...","cta":"...","hashtags":{"tiktok":[],"youtube":[],"instagram":[],"shorts":[],"linkedin":[],"x":[]}}',
    user: `Title context: ${title}\nDuration: ${opts.duration}s\nScore overall: ${analyzed.overall}\nTranscript:\n${snippet.slice(0, 2000)}`,
    maxTokens: 1400,
    temperature: 0.8,
  });

  if (llm.usedLlm) {
    const parsed = parseLlmJson<{
      youtube?: string[];
      tiktok?: string[];
      instagram?: string[];
      shorts?: string[];
      linkedin?: string[];
      x?: string[];
      description?: string;
      cta?: string;
      hashtags?: Record<string, string[]>;
    }>(llm.text);
    if (parsed) {
      usedLlm = true;
      if (parsed.youtube?.length) titles = { ...titles, youtube: parsed.youtube.slice(0, 10) };
      if (parsed.tiktok?.length) titles = { ...titles, tiktok: parsed.tiktok.slice(0, 10) };
      if (parsed.instagram?.length)
        titles = { ...titles, instagram: parsed.instagram.slice(0, 10) };
      if (parsed.shorts?.length) titles = { ...titles, shorts: parsed.shorts.slice(0, 10) };
      if (parsed.linkedin?.length)
        titles = { ...titles, linkedin: parsed.linkedin.slice(0, 8) };
      if (parsed.x?.length) titles = { ...titles, x: parsed.x.slice(0, 8) };
      if (parsed.description) description = parsed.description;
      if (parsed.cta) cta = parsed.cta;
      if (parsed.hashtags) hashtags = { ...hashtags, ...parsed.hashtags };
    }
  }

  const chapters: string[] = [];
  const sentences = snippet
    .split(/(?<=[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  if (sentences.length >= 2) {
    const n = Math.min(6, sentences.length);
    for (let i = 0; i < n; i++) {
      const t = (opts.duration * i) / n;
      const label = sentences[i].slice(0, 42).replace(/\s+/g, " ");
      chapters.push(
        `${String(Math.floor(t / 60))}:${String(Math.floor(t % 60)).padStart(2, "0")} — ${label}`,
      );
    }
  } else {
    const step = Math.max(8, opts.duration / 4);
    for (let t = 0; t < opts.duration; t += step) {
      chapters.push(
        `${String(Math.floor(t / 60))}:${String(Math.floor(t % 60)).padStart(2, "0")} — Beat ${chapters.length + 1}`,
      );
    }
  }

  const seoKeywords = Array.from(
    new Set(
      snippet
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .slice(0, 12),
    ),
  ).slice(0, 8);

  const pack: GrowthPack = {
    score: analyzed,
    titles,
    description,
    cta,
    hashtags,
    chapters: chapters.slice(0, 6),
    seoKeywords,
    thumbnailIdeas: [
      {
        id: "th-bold",
        label: "Bold hook",
        headline: titles.tiktok[0]?.slice(0, 28) || "WAIT FOR IT",
        vibe: "High contrast + big text",
      },
      {
        id: "th-face",
        label: "Reaction frame",
        headline: titles.youtube[0]?.slice(0, 28) || "This changed everything",
        vibe: "Close-up + yellow outline",
      },
      {
        id: "th-split",
        label: "Before / After",
        headline: "Before → After",
        vibe: "Split layout",
      },
      {
        id: "th-minimal",
        label: "Clean type",
        headline: titles.shorts[1]?.slice(0, 24) || "One tip",
        vibe: "Minimal white on dark",
      },
    ],
    createdAt: new Date().toISOString(),
  };

  return { pack, usedLlm };
}

/** Silence / filler cleanup suggestions for Auto Cleanup shell. */
export function cleanupSuggestions(input: {
  duration: number;
  transcriptText?: string;
  segments?: TranscriptSegment[];
}): { id: string; start: number; end: number; label: string; kind: "silence" | "filler" }[] {
  const out: {
    id: string;
    start: number;
    end: number;
    label: string;
    kind: "silence" | "filler";
  }[] = [];
  for (const g of silenceGaps(input.segments, input.duration).slice(0, 8)) {
    out.push({
      id: uid("cu"),
      start: g.start,
      end: g.end,
      label: `Silence ${(g.end - g.start).toFixed(1)}s`,
      kind: "silence",
    });
  }
  const flat = input.transcriptText || "";
  if (countMatches(flat, FILLER_WORDS) >= 2) {
    out.push({
      id: uid("fill"),
      start: 0,
      end: Math.min(3, input.duration),
      label: "Filler words in transcript — review opening",
      kind: "filler",
    });
  }
  return out;
}

export type BrollMoment = {
  start: number;
  end: number;
  reason: string;
  query: string;
};

const BROLL_MARKER_KINDS: AiMarkerKind[] = [
  "story",
  "tip",
  "viral",
  "energy",
  "emotional",
  "question",
  "funny",
  "surprise",
];

/** Heuristic B-roll insert windows from analyze markers, transcript gaps, growth pack. */
export function suggestBrollMoments(opts: {
  duration: number;
  aiMarkers?: AiSuggestion[];
  transcriptText?: string;
  segments?: TranscriptSegment[];
  silenceRanges?: { start: number; end: number }[];
  growthPack?: GrowthPack;
}): BrollMoment[] {
  const duration = Math.max(1, opts.duration || 30);
  const moments: BrollMoment[] = [];
  const taken = new Set<number>();

  function push(start: number, end: number, reason: string, query: string) {
    const s = Number(Math.max(0, start).toFixed(2));
    const e = Number(Math.min(duration, Math.max(s + 1.2, end)).toFixed(2));
    const key = Math.round(s * 2);
    if (taken.has(key)) return;
    taken.add(key);
    moments.push({
      start: s,
      end: e,
      reason,
      query: query.slice(0, 48) || "B-roll",
    });
  }

  const fromSilence = (opts.silenceRanges || []).filter((g) => g.end - g.start >= 1);
  const gapList = fromSilence.length ? fromSilence : silenceGaps(opts.segments, duration);
  for (const g of gapList.slice(0, 4)) {
    push(
      g.start,
      Math.min(g.end, g.start + 3.5),
      "Cover silence with B-roll",
      "ambient wash",
    );
  }

  const markers = [...(opts.aiMarkers || [])].sort((a, b) => b.score - a.score);
  for (const m of markers) {
    if (!BROLL_MARKER_KINDS.includes(m.kind)) continue;
    const text = windowText(opts.segments, m.start, m.end, opts.transcriptText || "");
    const query =
      text.slice(0, 40).trim() ||
      m.label.replace(/^[^\s]+\s/, "").slice(0, 40) ||
      m.kind;
    push(
      m.start,
      m.end || m.start + 3,
      m.reason || `${m.label} — illustrate with B-roll`,
      query,
    );
  }

  if (opts.growthPack?.chapters?.length) {
    const chapters = opts.growthPack.chapters.filter((c) => c.trim().length > 8);
    for (let i = 1; i < chapters.length && moments.length < 6; i++) {
      const t = (duration * i) / (chapters.length + 1);
      push(t, t + 3, `Chapter beat: ${chapters[i].slice(0, 36)}`, chapters[i].slice(0, 32));
    }
  }

  if (opts.growthPack?.thumbnailIdeas?.length && moments.length < 3) {
    for (const idea of opts.growthPack.thumbnailIdeas.slice(0, 2)) {
      const t = duration * (0.25 + moments.length * 0.2);
      push(t, t + 2.8, idea.vibe || idea.label, idea.headline || idea.label);
    }
  }

  if (!moments.length) {
    const slots = Math.min(3, Math.max(1, Math.floor(duration / 10)));
    for (let i = 0; i < slots; i++) {
      const t = (duration * (i + 1)) / (slots + 1);
      push(t, t + 2.5, "Visual accent", "B-roll plate");
    }
  }

  return moments.sort((a, b) => a.start - b.start).slice(0, 3);
}

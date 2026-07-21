/**
 * Rich viral scoring for clip windows — additive dimensions on top of heuristics.
 */
import type { TranscriptSegment } from "./types";

const HOOK = [
  "secret", "actually", "wait", "never", "always", "wrong", "mistake", "truth",
  "insane", "crazy", "shocking", "because", "here's", "heres", "why", "how",
  "stop", "don't", "dont", "nobody", "everyone", "finally", "warning", "imagine",
  "what if", "the problem", "the reason", "listen", "check this", "watch this",
  "game changer", "pro tip", "سر", "انتظر", "لما", "لماذا", "حقيقة", "مستحيل",
  "شوف", "انظر", "مهم", "صدق",
];

const CURIOSITY = [
  "secret", "nobody tells", "most people", "the truth", "what if", "imagine",
  "here's why", "the real reason", "you won't believe", "سر", "الحقيقة", "تخيل",
];

const CONFLICT = [
  "wrong", "mistake", "vs", "versus", "hate", "fight", "argue", "problem",
  "fail", "failed", "scam", "lie", "غلط", "مشكلة", "خطأ", "نصب",
];

const COMEDY = [
  "funny", "laugh", "lol", "joke", "hilarious", "comedy", "مضحك", "نكتة", "هههه",
];

const ADVICE = [
  "should", "need to", "have to", "tip", "hack", "how to", "steps", "first",
  "second", "third", "rule", "نصيحة", "لازم", "يجب", "خطوة",
];

const CTA_DEAD = [
  "subscribe", "like and subscribe", "follow me", "smash that", "comment below",
  "thanks for watching", "see you next", "sponsor", "sponsored", "use code",
  "اشترك", "لايك", "تابعوني", "الراعي",
];

const NUMBERS = /\b\d+[%kKmMbB]?\b|\$\d|\d+\s*(dollars|years|days|hours|minutes)/i;

function windowText(segments: TranscriptSegment[], start: number, end: number) {
  return segments
    .filter((s) => s.start < end && s.end > start)
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function countHits(text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  return phrases.reduce((n, p) => n + (lower.includes(p) ? 1 : 0), 0);
}

function speechDensity(segments: TranscriptSegment[], start: number, end: number) {
  const words = segments
    .flatMap((s) => s.words)
    .filter((w) => w.start >= start && w.end <= end);
  return words.length / Math.max(end - start, 1);
}

function pauseRatio(segments: TranscriptSegment[], start: number, end: number) {
  const words = segments
    .flatMap((s) => s.words)
    .filter((w) => w.end > start && w.start < end)
    .sort((a, b) => a.start - b.start);
  if (words.length < 2) return 0.5;
  let gaps = 0;
  let gapTime = 0;
  for (let i = 1; i < words.length; i++) {
    const g = words[i].start - words[i - 1].end;
    if (g > 0.35) {
      gaps += 1;
      gapTime += g;
    }
  }
  return Math.min(1, gapTime / Math.max(end - start, 1));
}

export type ClipQualityScores = {
  viralityScore: number;
  retentionScore: number;
  hookScore: number;
  confidenceScore: number;
  captionQuality: number;
  reasons: string[];
};

export function scoreClipWindow(opts: {
  segments: TranscriptSegment[];
  start: number;
  end: number;
  activeOverlap: number;
  duration: number;
}): ClipQualityScores {
  const { segments, start, end, activeOverlap, duration } = opts;
  const text = windowText(segments, start, end);
  const early = windowText(segments, start, start + 3);
  const late = windowText(segments, Math.max(start, end - 4), end);
  const density = speechDensity(segments, start, end);
  const pauses = pauseRatio(segments, start, end);
  const hooks = countHits(text, HOOK);
  const earlyHooks = countHits(early, HOOK);
  const curiosity = countHits(text, CURIOSITY);
  const conflict = countHits(text, CONFLICT);
  const comedy = countHits(text, COMEDY);
  const advice = countHits(text, ADVICE);
  const dead = countHits(text, CTA_DEAD);
  const questions = (text.match(/[?؟]/g) || []).length;
  const hasNumber = NUMBERS.test(text);
  const strongEnd = countHits(late, [...HOOK, ...CURIOSITY, ...ADVICE]);

  const hookScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(earlyHooks * 22 + hooks * 8 + curiosity * 10 + questions * 6),
    ),
  );

  const retentionScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        density * 12 +
          activeOverlap * 40 +
          (1 - pauses) * 25 +
          advice * 5 +
          strongEnd * 6 -
          dead * 20,
      ),
    ),
  );

  const viralityRaw =
    density * 12 +
    hooks * 9 +
    earlyHooks * 10 +
    questions * 7 +
    curiosity * 8 +
    conflict * 7 +
    comedy * 6 +
    advice * 5 +
    (hasNumber ? 8 : 0) +
    activeOverlap * 22 +
    strongEnd * 6 -
    dead * 18 -
    pauses * 15;

  // Prefer mid energy on long videos
  const mid = duration / 2;
  const dist = Math.abs((start + end) / 2 - mid) / Math.max(mid, 1);
  const viralityScore = Math.max(
    55,
    Math.min(98, Math.round(58 + viralityRaw / 2.8 + (1 - dist) * 4)),
  );

  const captionQuality = Math.max(
    20,
    Math.min(
      100,
      Math.round(
        (text.length > 40 ? 70 : 40) +
          density * 8 -
          pauses * 20 +
          (questions ? 5 : 0),
      ),
    ),
  );

  const confidenceScore = Math.max(
    40,
    Math.min(
      95,
      Math.round(
        50 +
          (text ? 15 : -10) +
          activeOverlap * 20 +
          Math.min(15, hooks * 4) -
          dead * 8,
      ),
    ),
  );

  const reasons: string[] = [];
  if (earlyHooks) reasons.push("strong opening hook");
  if (curiosity) reasons.push("curiosity gap");
  if (conflict) reasons.push("conflict / stakes");
  if (comedy) reasons.push("comedy beat");
  if (advice) reasons.push("actionable advice");
  if (questions) reasons.push("question pull");
  if (hasNumber) reasons.push("specific numbers");
  if (density > 2.2) reasons.push("fast dialogue");
  if (activeOverlap > 0.75) reasons.push("loud/active audio");
  if (strongEnd) reasons.push("strong ending");
  if (dead) reasons.push("trimmed CTA risk");
  if (!reasons.length) reasons.push("solid activity window");

  return {
    viralityScore,
    retentionScore,
    hookScore,
    confidenceScore,
    captionQuality,
    reasons: reasons.slice(0, 3),
  };
}

export function buildSocialPack(opts: {
  title: string;
  hook: string;
  text: string;
  lang: "ar" | "en";
}): {
  description: string;
  hashtags: string[];
  pinnedComment: string;
  cta: string;
} {
  const { title, hook, text, lang } = opts;
  const snippet = text.slice(0, 160).trim();
  if (lang === "ar") {
    return {
      description: `${hook}\n\n${snippet}${snippet.length >= 160 ? "…" : ""}\n\n#shorts #ريلز`,
      hashtags: ["#مقاطع", "#ريلز", "#تيك_توك", "#نصائح", "#viral"],
      pinnedComment: `أقوى جزء: ${title}`,
      cta: "احفظ الفيديو وجرب الفكرة اليوم",
    };
  }
  return {
    description: `${hook}\n\n${snippet}${snippet.length >= 160 ? "…" : ""}\n\n#shorts #reels`,
    hashtags: ["#shorts", "#reels", "#viral", "#tips", "#fyp"],
    pinnedComment: `Best part: ${title}`,
    cta: "Save this and try it today",
  };
}

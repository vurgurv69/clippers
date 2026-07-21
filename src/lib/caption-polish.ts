/**
 * Caption polish — readability without changing meaning.
 * Used by ClipStudio burn-in and Studio karaoke.
 */
import type { TranscriptWord } from "./types";

export type CaptionReadMode = "verbatim" | "readable" | "minimal";
export type CaptionHighlightMode = "word" | "phrase" | "line";
export type CaptionAnimPreset =
  | "scale"
  | "pop"
  | "glow"
  | "underline"
  | "color-fill"
  | "bounce";

export type CaptionThemeId =
  | "tiktok-clean"
  | "tiktok-bold"
  | "hormozi"
  | "podcast"
  | "gaming"
  | "minimal"
  | "cinematic"
  | "luxury"
  | "neon"
  | "youtube-shorts"
  | "instagram-reels";

export type CaptionTheme = {
  id: CaptionThemeId;
  label: string;
  font: string;
  arabicFont: string;
  size: number;
  bold: boolean;
  primary: string;
  highlight: string;
  outline: string;
  outlineW: number;
  shadow: number;
  back: string;
  marginV: number;
  anim: CaptionAnimPreset;
  uppercase: boolean;
};

export const CAPTION_THEMES: Record<CaptionThemeId, CaptionTheme> = {
  "tiktok-clean": {
    id: "tiktok-clean",
    label: "TikTok Clean",
    font: "Arial",
    arabicFont: "Tahoma",
    size: 64,
    bold: true,
    primary: "&H00FFFFFF",
    highlight: "&H0000E5FF",
    outline: "&H00000000",
    outlineW: 5,
    shadow: 0,
    back: "&H64000000",
    marginV: 380,
    anim: "color-fill",
    uppercase: false,
  },
  "tiktok-bold": {
    id: "tiktok-bold",
    label: "TikTok Bold",
    font: "Arial Black",
    arabicFont: "Tahoma",
    size: 72,
    bold: true,
    primary: "&H00FFFFFF",
    highlight: "&H0000FF9C",
    outline: "&H00000000",
    outlineW: 8,
    shadow: 0,
    back: "&H80000000",
    marginV: 400,
    anim: "pop",
    uppercase: true,
  },
  hormozi: {
    id: "hormozi",
    label: "Hormozi",
    font: "Impact",
    arabicFont: "Tahoma",
    size: 78,
    bold: true,
    primary: "&H00FFFFFF",
    highlight: "&H0000FFFF",
    outline: "&H00000000",
    outlineW: 10,
    shadow: 0,
    back: "&H00000000",
    marginV: 420,
    anim: "scale",
    uppercase: true,
  },
  podcast: {
    id: "podcast",
    label: "Podcast",
    font: "Georgia",
    arabicFont: "Tahoma",
    size: 58,
    bold: false,
    primary: "&H00F5F5F5",
    highlight: "&H00FFB84D",
    outline: "&H00202020",
    outlineW: 3,
    shadow: 2,
    back: "&H90000000",
    marginV: 360,
    anim: "underline",
    uppercase: false,
  },
  gaming: {
    id: "gaming",
    label: "Gaming",
    font: "Arial Black",
    arabicFont: "Tahoma",
    size: 70,
    bold: true,
    primary: "&H00FFFFFF",
    highlight: "&H0000FF4D",
    outline: "&H00400080",
    outlineW: 7,
    shadow: 1,
    back: "&H70000000",
    marginV: 400,
    anim: "bounce",
    uppercase: true,
  },
  minimal: {
    id: "minimal",
    label: "Minimal",
    font: "Arial",
    arabicFont: "Tahoma",
    size: 52,
    bold: false,
    primary: "&H00FFFFFF",
    highlight: "&H00FFFFFF",
    outline: "&H00000000",
    outlineW: 2,
    shadow: 1,
    back: "&H00000000",
    marginV: 340,
    anim: "glow",
    uppercase: false,
  },
  cinematic: {
    id: "cinematic",
    label: "Cinematic",
    font: "Georgia",
    arabicFont: "Tahoma",
    size: 54,
    bold: false,
    primary: "&H00E8E8E8",
    highlight: "&H00C0C0C0",
    outline: "&H00101010",
    outlineW: 2,
    shadow: 3,
    back: "&H00000000",
    marginV: 320,
    anim: "glow",
    uppercase: false,
  },
  luxury: {
    id: "luxury",
    label: "Luxury",
    font: "Georgia",
    arabicFont: "Tahoma",
    size: 56,
    bold: false,
    primary: "&H00D4E8FF",
    highlight: "&H00A0D0FF",
    outline: "&H00201000",
    outlineW: 3,
    shadow: 2,
    back: "&H60000000",
    marginV: 360,
    anim: "color-fill",
    uppercase: false,
  },
  neon: {
    id: "neon",
    label: "Neon",
    font: "Arial Black",
    arabicFont: "Tahoma",
    size: 68,
    bold: true,
    primary: "&H00FF4DFF",
    highlight: "&H0000FFFF",
    outline: "&H00400040",
    outlineW: 6,
    shadow: 0,
    back: "&H80000000",
    marginV: 400,
    anim: "glow",
    uppercase: true,
  },
  "youtube-shorts": {
    id: "youtube-shorts",
    label: "YouTube Shorts",
    font: "Arial Black",
    arabicFont: "Tahoma",
    size: 66,
    bold: true,
    primary: "&H00FFFFFF",
    highlight: "&H0000C8FF",
    outline: "&H00000000",
    outlineW: 6,
    shadow: 1,
    back: "&H70000000",
    marginV: 390,
    anim: "pop",
    uppercase: false,
  },
  "instagram-reels": {
    id: "instagram-reels",
    label: "Instagram Reels",
    font: "Arial",
    arabicFont: "Tahoma",
    size: 62,
    bold: true,
    primary: "&H00FFFFFF",
    highlight: "&H00FF7A4D",
    outline: "&H00000000",
    outlineW: 5,
    shadow: 1,
    back: "&H64000000",
    marginV: 380,
    anim: "color-fill",
    uppercase: false,
  },
};

const FILLERS_EN = new Set([
  "um",
  "uh",
  "uhm",
  "erm",
  "like",
  "you know",
  "kinda",
  "kind of",
  "sort of",
  "sorta",
  "basically",
  "literally",
  "actually",
  "i mean",
]);

const FILLERS_AR = new Set(["يعني", "اه", "ايه", "ام", "كذا"]);

const EMPHASIS = new Set([
  "money",
  "free",
  "secret",
  "never",
  "always",
  "warning",
  "mistake",
  "best",
  "worst",
  "insane",
  "crazy",
  "shocking",
  "truth",
  "stop",
  "don't",
  "dont",
  "must",
  "now",
  "today",
  "million",
  "billion",
  "سر",
  "مهم",
  "حقيقة",
  "مستحيل",
  "تحذير",
  "أفضل",
  "أسوأ",
  "مجاني",
  "فلوس",
]);

const EMOJI_RULES: Array<{ re: RegExp; emoji: string }> = [
  { re: /\b(money|cash|profit|\$|dollar|فلوس|ربح)\b/i, emoji: "💰" },
  { re: /\b(grow|growth|scale|launch|rocket|نمو)\b/i, emoji: "🚀" },
  { re: /\b(warn|warning|danger|careful|تحذير)\b/i, emoji: "⚠️" },
  { re: /\b(funny|laugh|lol|hilarious|مضحك)\b/i, emoji: "😂" },
  { re: /\b(shock|surprise|insane|crazy|wow|مستحيل)\b/i, emoji: "😱" },
  { re: /\b(win|success|best|fire|نجاح|أفضل)\b/i, emoji: "🔥" },
  { re: /\b(tip|hack|secret|سر)\b/i, emoji: "💡" },
];

export type PolishedWord = TranscriptWord & {
  emphasis?: boolean;
  emoji?: string;
};

function stripPunct(w: string) {
  return w.replace(/^[^\w\u0600-\u06FF$%]+|[^\w\u0600-\u06FF$%]+$/gu, "");
}

function isFiller(word: string, lang: "ar" | "en") {
  const bare = stripPunct(word).toLowerCase();
  if (!bare) return true;
  if (lang === "ar") return FILLERS_AR.has(bare) || FILLERS_AR.has(word.trim());
  return FILLERS_EN.has(bare);
}

function capitalizeSentence(words: PolishedWord[], lang: "ar" | "en") {
  if (lang === "ar" || !words.length) return;
  let capNext = true;
  for (const w of words) {
    const bare = stripPunct(w.word);
    if (!bare) continue;
    if (capNext && /[a-z]/.test(bare[0])) {
      w.word = w.word.replace(bare, bare[0].toUpperCase() + bare.slice(1));
    }
    capNext = /[.!?؟۔]$/.test(w.word.trim());
  }
}

function restorePunctuation(words: PolishedWord[]) {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    if (next && next.start - w.end > 0.55 && !/[.!?؟،,;:]$/.test(w.word)) {
      w.word = `${w.word.replace(/[,،]$/, "")}.`;
    }
  }
}

/** Polish transcript words for captions. Keeps timing; may drop fillers. */
export function polishCaptionWords(
  words: TranscriptWord[],
  opts: {
    lang: "ar" | "en";
    mode?: CaptionReadMode;
    emojis?: boolean;
  },
): PolishedWord[] {
  const mode = opts.mode || "readable";
  const out: PolishedWord[] = [];

  for (const w of words) {
    const raw = w.word.trim();
    if (!raw) continue;
    if (mode !== "verbatim" && isFiller(raw, opts.lang)) continue;
    if (mode === "minimal") {
      const bare = stripPunct(raw).toLowerCase();
      if (/^(just|really|very|basically|actually|literally|honestly|so)$/i.test(bare)) {
        continue;
      }
    }
    const emphasis = EMPHASIS.has(stripPunct(raw).toLowerCase());
    out.push({ ...w, word: raw, emphasis });
  }

  restorePunctuation(out);
  capitalizeSentence(out, opts.lang);

  if (opts.emojis) {
    let since = 0;
    for (let i = 0; i < out.length; i++) {
      since += 1;
      if (since < 6) continue;
      const window = out
        .slice(Math.max(0, i - 2), i + 1)
        .map((x) => x.word)
        .join(" ");
      const hit = EMOJI_RULES.find((r) => r.re.test(window));
      if (hit && out[i].emphasis) {
        out[i].emoji = hit.emoji;
        since = 0;
      }
    }
  }

  return out;
}

/** Split into natural 2–6 word phrases using pauses + punctuation. */
export function phraseCaptionBlocks(
  words: PolishedWord[],
  opts: { lang: "ar" | "en"; minWords?: number; maxWords?: number },
): PolishedWord[][] {
  const minW = opts.minWords ?? 2;
  const maxW = opts.maxWords ?? (opts.lang === "ar" ? 5 : 6);
  if (!words.length) return [];

  const blocks: PolishedWord[][] = [];
  let cur: PolishedWord[] = [];

  const flush = () => {
    if (!cur.length) return;
    if (cur.length === 1 && blocks.length) {
      const prev = blocks[blocks.length - 1];
      if (prev.length < maxW) {
        prev.push(cur[0]);
        cur = [];
        return;
      }
    }
    blocks.push(cur);
    cur = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = cur[cur.length - 1];
    const gap = prev ? w.start - prev.end : 0;
    const punctBreak = prev ? /[.!?؟۔]$/.test(prev.word.trim()) : false;
    const softBreak = prev ? /[,،;:]$/.test(prev.word.trim()) : false;

    const shouldBreak =
      cur.length >= maxW ||
      (cur.length >= minW && (gap > 0.35 || punctBreak)) ||
      (cur.length >= minW + 1 && softBreak && gap > 0.18);

    if (shouldBreak) flush();
    cur.push(w);
  }
  flush();

  if (blocks.length >= 2) {
    const last = blocks[blocks.length - 1];
    const prev = blocks[blocks.length - 2];
    if (last.length === 1 && prev.length > minW) {
      last.unshift(prev.pop()!);
    }
  }

  return blocks;
}

export function balanceTwoLines(text: string, maxLine = 22): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 3 || text.length <= maxLine) return text;
  const mid = Math.ceil(words.length / 2);
  const splitAt = words.length - mid === 1 ? Math.max(1, mid - 1) : mid;
  return `${words.slice(0, splitAt).join(" ")}\\N${words.slice(splitAt).join(" ")}`;
}

export function displayCaptionWord(
  word: string,
  lang: "ar" | "en",
  theme: CaptionTheme,
) {
  const t = word.trim();
  if (theme.uppercase && lang === "en") return t.toUpperCase();
  return t;
}

export function animTags(
  anim: CaptionAnimPreset,
  active: boolean,
  baseSize: number,
  highlight: string,
  primary: string,
): string {
  if (!active) return `\\c${primary}\\fs${baseSize}`;
  switch (anim) {
    case "scale":
      return `\\c${highlight}\\fs${baseSize + 16}\\fscx110\\fscy110\\b1`;
    case "pop":
      return `\\c${highlight}\\fs${baseSize + 18}\\b1`;
    case "glow":
      return `\\c${highlight}\\fs${baseSize + 10}\\bord8\\blur2\\b1`;
    case "underline":
      return `\\c${highlight}\\fs${baseSize + 8}\\u1\\b1`;
    case "bounce":
      return `\\c${highlight}\\fs${baseSize + 14}\\b1`;
    case "color-fill":
    default:
      return `\\c${highlight}\\fs${baseSize + 12}\\b1`;
  }
}

export function resolveCaptionTheme(id?: string | null): CaptionTheme {
  if (id && id in CAPTION_THEMES) {
    return CAPTION_THEMES[id as CaptionThemeId];
  }
  return CAPTION_THEMES["tiktok-bold"];
}

import { diarizeSegments, speakerAssColor } from "./diarize";
import {
  phraseCaptionBlocks,
  polishCaptionWords,
  resolveCaptionTheme,
  type CaptionReadMode,
  type CaptionThemeId,
} from "./caption-polish";
import {
  captionAlignment,
  clampFontSize,
  clampOutline,
  resolveCaptionFont,
  type CaptionAlign,
  type CaptionFontFamily,
} from "./caption-style";
import { detectScriptLanguage } from "./topic-title";
import { transcribeWavFile } from "./transcribe";
import type { TranscriptSegment, TranscriptWord } from "./types";

const ARABIC_RE = /[\u0600-\u06FF]/;
const RLM = "\u200F";
const ORPHAN = /^(uh+|um+|er+|ah+|mm+|hmm+|like|you know|يعني|اه+|ام+)$/i;

/** Speaker highlight palettes (ASS BGR). Base fill stays white unless overridden. */
export const SPEAKER_HIGHLIGHTS = [
  "&H0000FFFF", // 1 yellow
  "&H00FFFF00", // 2 cyan
  "&H0000FF00", // 3 green
  "&H00FF00FF", // 4 magenta
];
export const SPEAKER_PRIMARY = "&H00FFFFFF";

export type GenerateAssKaraokeOptions = {
  playResX?: number;
  playResY?: number;
  themeId?: CaptionThemeId | string;
  readMode?: CaptionReadMode;
  language?: "ar" | "en";
  whisperQuality?: string;
  /** Inactive / resting fill — CSS hex or ASS. */
  primaryColor?: string;
  /** Active karaoke highlight — CSS hex or ASS. */
  highlightColor?: string;
  speakerColors?: string[];
  fontFamily?: CaptionFontFamily | string;
  align?: CaptionAlign | string;
  fontSize?: number;
  outlineWidth?: number;
  /** Opaque back box (BorderStyle 3) instead of outline-only. */
  boxStyle?: boolean;
  shadow?: number;
  transcript?: TranscriptSegment[] | TranscriptWord[] | null;
};

/**
 * CSS hex → ASS `&HAABBGGRR`.
 * `#FF5733` → `&H003357FF`, `#80FF5733` (AA RR GG BB) → `&H803357FF`.
 */
export function hexToAssColor(
  raw?: string | null,
  fallback = "&H00FFFFFF",
): string {
  if (!raw) return fallback;
  const text = raw.trim().replace(/&$/i, "");
  if (/^&H[0-9A-Fa-f]{6,8}$/i.test(text)) {
    const body = text.slice(2);
    return (body.length === 6 ? `&H00${body}` : `&H${body}`).toUpperCase();
  }
  let hex = text.replace(/^#/, "");
  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  let aa = "00";
  let rr: string;
  let gg: string;
  let bb: string;
  if (/^[0-9A-Fa-f]{8}$/.test(hex)) {
    aa = hex.slice(0, 2);
    rr = hex.slice(2, 4);
    gg = hex.slice(4, 6);
    bb = hex.slice(6, 8);
  } else if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    rr = hex.slice(0, 2);
    gg = hex.slice(2, 4);
    bb = hex.slice(4, 6);
  } else {
    return fallback;
  }
  return `&H${aa}${bb}${gg}${rr}`.toUpperCase();
}

/** Alias used by older imports. */
export const toAssColor = hexToAssColor;

function assTime(seconds: number) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, " ");
}

function asWords(
  transcript: TranscriptSegment[] | TranscriptWord[],
): TranscriptWord[] {
  if (!transcript.length) return [];
  if ("word" in transcript[0]) {
    return (transcript as TranscriptWord[])
      .filter((w) => w.word.trim())
      .map((w) => ({
        ...w,
        word: w.word.trim(),
        start: Math.max(0, w.start),
        end: Math.max(0.05, w.end),
      }))
      .sort((a, b) => a.start - b.start);
  }
  const words: TranscriptWord[] = [];
  for (const seg of transcript as TranscriptSegment[]) {
    if (seg.words?.length) {
      for (const w of seg.words) {
        if (!w.word.trim()) continue;
        words.push({
          word: w.word.trim(),
          start: Math.max(0, w.start),
          end: Math.max(0.05, w.end),
          speakerId: w.speakerId,
        });
      }
      continue;
    }
    const parts = (seg.text || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const span = Math.max(0.2, seg.end - seg.start);
    const step = span / parts.length;
    parts.forEach((part, i) => {
      words.push({
        word: part,
        start: Math.max(0, seg.start + i * step),
        end: Math.max(0.05, seg.start + (i + 1) * step),
      });
    });
  }
  words.sort((a, b) => a.start - b.start);
  return words;
}

export function cleanCaptionWords(words: TranscriptWord[]): TranscriptWord[] {
  const cleaned: TranscriptWord[] = [];
  for (const raw of words) {
    let token = raw.word
      .replace(/^["'`«»]+|["'`«»]+$/g, "")
      .replace(/^[.,،;:]+|[.,،;:]{2,}$/g, "")
      .replace(/\s+/g, "")
      .trim();
    if (!token) continue;
    if (ORPHAN.test(token)) continue;
    if (token.length === 1 && !/[A-Za-z\u0600-\u06FF0-9]/.test(token)) continue;
    // Keep Whisper timestamps — only nudge overlaps, never push words later than audio.
    let start = Math.max(0, raw.start);
    let end = Math.max(start + 0.06, raw.end);
    if (cleaned.length) {
      const prev = cleaned[cleaned.length - 1];
      if (start < prev.end) {
        const mid = (prev.end + start) / 2;
        prev.end = Number(Math.max(prev.start + 0.05, mid).toFixed(3));
        start = Math.max(start, prev.end);
        end = Math.max(start + 0.06, end);
      }
    }
    if (end - start > 4) continue;
    cleaned.push({
      ...raw,
      word: token,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    });
  }
  return cleaned;
}

function isArabicScript(text: string) {
  return ARABIC_RE.test(text);
}

/**
 * CapCut-style `\kf` wipe.
 * libass fills FROM SecondaryColour (inactive base) TO PrimaryColour (active highlight).
 * `\kfN` is centiseconds relative to Dialogue Start — consecutive spans must tile
 * exactly against audio (sum of prior kf == word.start - lineStart).
 */
function karaokeToken(
  word: string,
  durationSec: number,
  rtl: boolean,
  highlight: string,
  base: string,
) {
  const cs = Math.max(4, Math.round(Math.max(0.04, durationSec) * 100));
  const safe = escapeAss(word);
  // RLM keeps each Arabic token in RTL context without reversing speech order.
  const marked = rtl && isArabicScript(word) ? `${RLM}${safe}` : safe;
  return `{\\c${highlight}&\\2c${base}&\\kf${cs}}${marked}`;
}

/**
 * Build Dialogue-relative `\kf` spans locked to Whisper word timestamps.
 * Silence gaps → empty `\kf` so the wipe clock never drifts ahead of audio.
 */
function syncWordIntervals(chunk: TranscriptWord[]): {
  lineStart: number;
  lineEnd: number;
  spans: { text: string; duration: number; word?: TranscriptWord }[];
} {
  if (!chunk.length) {
    return { lineStart: 0, lineEnd: 0.32, spans: [] };
  }

  const sorted = [...chunk].sort((a, b) => a.start - b.start || a.end - b.end);
  const lineStart = Math.max(0, Number(sorted[0].start.toFixed(3)));
  const spans: { text: string; duration: number; word?: TranscriptWord }[] = [];
  let cursor = lineStart;

  for (let i = 0; i < sorted.length; i++) {
    const w = sorted[i];
    const next = sorted[i + 1];
    const absStart = Math.max(0, Number(w.start.toFixed(3)));

    if (absStart > cursor + 0.005) {
      spans.push({ text: "", duration: absStart - cursor });
      cursor = absStart;
    } else if (absStart < cursor) {
      // Overlap / jitter — clamp start to cursor (no artificial lag added).
    } else {
      cursor = absStart;
    }

    let absEnd: number;
    if (next) {
      const nextStart = Math.max(0, Number(next.start.toFixed(3)));
      absEnd = Math.min(Math.max(Number(w.end.toFixed(3)), cursor + 0.04), nextStart);
      if (absEnd <= cursor) absEnd = Math.min(nextStart, cursor + 0.04);
    } else {
      absEnd = Math.max(cursor + 0.05, Number(w.end.toFixed(3)));
    }

    const duration = Math.max(0.04, absEnd - cursor);
    spans.push({ text: w.word, duration, word: w });
    cursor = absEnd;
  }

  const lineEnd = Math.max(cursor, lineStart + 0.2);
  return { lineStart, lineEnd, spans };
}

export function buildKaraokeAssFromWords(
  words: TranscriptWord[],
  options?: GenerateAssKaraokeOptions,
): { ass: string; language: "ar" | "en"; speakerCount: number } {
  const sample = words.map((w) => w.word).join(" ");
  const detected = detectScriptLanguage(sample);
  const lang = options?.language || detected;
  const arabicChars = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  const rtl = lang === "ar" || arabicChars >= 3;
  const theme = resolveCaptionTheme(options?.themeId);
  const playX = options?.playResX || 1080;
  const playY = options?.playResY || 1920;
  const font =
    resolveCaptionFont(options?.fontFamily, rtl) ||
    (rtl ? "Amiri" : theme.font);
  const fontFallback = rtl ? "Tahoma" : font;
  const size = clampFontSize(
    options?.fontSize,
    rtl ? Math.round(theme.size * 0.95) : theme.size,
  );
  const outlineW = clampOutline(options?.outlineWidth, theme.outlineW);
  const shadow =
    options?.shadow != null ? Math.max(0, Math.min(8, options.shadow)) : theme.shadow;
  const box = Boolean(options?.boxStyle);
  const pos = captionAlignment(options?.align);
  const bold = theme.bold ? -1 : 0;

  const userBase = hexToAssColor(options?.primaryColor, theme.primary);
  const userHighlight = hexToAssColor(options?.highlightColor, theme.highlight);
  const speakerPalette = (options?.speakerColors || SPEAKER_HIGHLIGHTS).map((c, i) =>
    hexToAssColor(c, SPEAKER_HIGHLIGHTS[i] || userHighlight),
  );

  const polished = polishCaptionWords(cleanCaptionWords(words), {
    lang: rtl ? "ar" : lang,
    mode: options?.readMode || "verbatim",
    emojis: false,
  });
  const blocks = phraseCaptionBlocks(polished, {
    lang: rtl ? "ar" : lang,
    minWords: rtl ? 2 : 2,
    maxWords: rtl ? 4 : 4,
  });

  const speakers = new Set(
    polished.map((w) => w.speakerId).filter((id): id is number => id != null),
  );
  const speakerCount = Math.max(1, Math.min(4, speakers.size || 1));

  const borderStyle = box ? 3 : 1;
  const back = box ? hexToAssColor(theme.back, "&H80000000") : theme.back;

  // WrapStyle 2 = smarter wrapping; required for clean Arabic multi-word lines.
  const header = `[Script Info]
Title: Clippers Karaoke
ScriptType: v4.00+
WrapStyle: ${rtl ? 2 : 0}
ScaledBorderAndShadow: yes
PlayResX: ${playX}
PlayResY: ${playY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,${font},${size},${userHighlight},${userBase},${theme.outline},${back},${bold},0,0,0,100,100,0,0,${borderStyle},${outlineW},${shadow},${pos.alignment},90,90,${pos.marginV},1
${rtl ? `Style: WordFallback,${fontFallback},${size},${userHighlight},${userBase},${theme.outline},${back},${bold},0,0,0,100,100,0,0,${borderStyle},${outlineW},${shadow},${pos.alignment},90,90,${pos.marginV},1\n` : ""}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  if (!blocks.length) {
    return { ass: header, language: rtl ? "ar" : lang, speakerCount };
  }

  const lines: string[] = [];
  // \q2 = wrap mode; \fn Amiri then Tahoma so missing Amiri still shapes Arabic; RLM seeds RTL.
  const rtlTags = rtl ? `\\q2\\fn${font}` : `\\fn${font}`;
  const boxTag = box
    ? `\\bord0\\shad${shadow}\\4a&H60&`
    : `\\bord${outlineW}\\shad${shadow}`;

  for (const chunk of blocks) {
    const { lineStart, lineEnd, spans } = syncWordIntervals(chunk);
    if (!spans.length) continue;

    const karaoke = spans
      .map((span, idx) => {
        if (!span.text) {
          const cs = Math.max(1, Math.round(span.duration * 100));
          return `{\\kf${cs}}`;
        }
        const sid = span.word?.speakerId ?? 0;
        const highlight =
          speakerCount > 1
            ? speakerPalette[Math.abs(sid) % speakerPalette.length]
            : userHighlight;
        const token = karaokeToken(span.text, span.duration, rtl, highlight, userBase);
        const prev = spans[idx - 1];
        // Arabic: thin space after prior spoken token (BiDi-safe separator).
        if (prev?.text) {
          return rtl ? `\u00A0${token}` : ` ${token}`;
        }
        return token;
      })
      .join("");

    const prefix = rtl ? RLM : "";
    lines.push(
      `Dialogue: 0,${assTime(lineStart)},${assTime(lineEnd)},Word,,0,0,0,,{\\an${pos.an}${rtlTags}${boxTag}}${prefix}${karaoke}`,
    );
  }

  return {
    ass: header + lines.join("\n") + "\n",
    language: rtl ? "ar" : lang,
    speakerCount,
  };
}

function normalizeOptions(
  second?: GenerateAssKaraokeOptions | TranscriptSegment[] | TranscriptWord[] | null,
  third?: GenerateAssKaraokeOptions,
): GenerateAssKaraokeOptions {
  if (!second) return third || {};
  if (Array.isArray(second)) {
    return { ...(third || {}), transcript: second };
  }
  return { ...second, ...third };
}

/**
 * Clip-local karaoke ASS.
 * Prefer an existing job transcript when provided — skip a second Whisper pass.
 */
export async function generateAssKaraoke(
  clipAudioPath: string,
  options?: GenerateAssKaraokeOptions | TranscriptSegment[] | TranscriptWord[] | null,
  legacy?: GenerateAssKaraokeOptions,
): Promise<{
  ass: string;
  segments: TranscriptSegment[];
  language: "ar" | "en";
  speakerCount: number;
}> {
  const opts = normalizeOptions(options, legacy);
  let segments: TranscriptSegment[] = [];

  if (opts.transcript?.length) {
    const fallback = asWords(opts.transcript);
    if (fallback.length) {
      segments = [
        {
          id: 0,
          start: 0,
          end: Math.max(...fallback.map((w) => w.end), 0.4),
          text: fallback.map((w) => w.word).join(" "),
          words: fallback,
        },
      ];
    }
  }

  // Only re-run ASR when we have no usable words and a clip WAV is available.
  if (
    !segments.some((s) => s.words?.length || s.text.trim()) &&
    clipAudioPath
  ) {
    segments = await transcribeWavFile({
      wavPath: clipAudioPath,
      whisperQuality: opts.whisperQuality,
      timeOffset: 0,
    });
  }

  if (!segments.some((s) => s.words?.length || s.text.trim()) && opts.transcript?.length) {
    const fallback = asWords(opts.transcript);
    segments = [
      {
        id: 0,
        start: 0,
        end: Math.max(...fallback.map((w) => w.end), 0.4),
        text: fallback.map((w) => w.word).join(" "),
        words: fallback,
      },
    ];
  }

  const dia = diarizeSegments(segments, 4);
  const words = asWords(dia.segments);
  const built = buildKaraokeAssFromWords(words, opts);
  return {
    ass: built.ass,
    segments: dia.segments,
    language: built.language,
    speakerCount: dia.speakerCount,
  };
}

export { speakerAssColor };

import type { TranscriptSegment, TranscriptWord } from "./types";
import { detectScriptLanguage } from "./topic-title";
import { buildKaraokeAssFromWords } from "./ass-karaoke";
import {
  type CaptionHighlightMode,
  type CaptionReadMode,
  type CaptionThemeId,
} from "./caption-polish";

export type { CaptionThemeId, CaptionReadMode, CaptionHighlightMode };
export { CAPTION_THEMES, resolveCaptionTheme } from "./caption-polish";

function wordsInRange(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const seg of segments) {
    const timed = Array.isArray(seg.words) ? seg.words : [];
    if (timed.length) {
      for (const w of timed) {
        if (w.end > start && w.start < end && w.word.trim()) {
          words.push({
            word: w.word.trim(),
            start: Math.max(0, w.start - start),
            end: Math.max(0.05, w.end - start),
            speakerId: w.speakerId,
          });
        }
      }
      continue;
    }
    if (seg.end <= start || seg.start >= end) continue;
    const text = (seg.text || "").trim();
    if (!text) continue;
    const parts = text.split(/\s+/).filter(Boolean);
    const segStart = Math.max(seg.start, start);
    const segEnd = Math.min(seg.end, end);
    const span = Math.max(0.2, segEnd - segStart);
    const step = span / parts.length;
    parts.forEach((part, i) => {
      words.push({
        word: part,
        start: Math.max(0, segStart - start + i * step),
        end: Math.max(0.05, segStart - start + (i + 1) * step),
      });
    });
  }
  words.sort((a, b) => a.start - b.start);
  return words;
}

export type BuildAssOptions = {
  themeId?: CaptionThemeId | string;
  readMode?: CaptionReadMode;
  highlightMode?: CaptionHighlightMode;
  emojis?: boolean;
  playResX?: number;
  playResY?: number;
  /** Burn a title card. Off by default so captions stay what was said. */
  showTitle?: boolean;
};

/**
 * Captions from timed speech — karaoke highlight + themes.
 */
export function buildAssCaptions(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
  clipTitle: string,
  language?: "ar" | "en",
  options?: BuildAssOptions,
): string {
  const rawWords = wordsInRange(segments, clipStart, clipEnd);
  const sample = rawWords.map((w) => w.word).join(" ") || clipTitle;
  const { ass } = buildKaraokeAssFromWords(rawWords, {
    themeId: options?.themeId,
    readMode: options?.readMode || "verbatim",
    language: language || detectScriptLanguage(sample),
    playResX: options?.playResX || 1080,
    playResY: options?.playResY || 1920,
  });
  return ass;
}

/** Studio karaoke ASS — uses same polish + theme system. */
export function buildTimelineKaraokeAss(opts: {
  words: TranscriptWord[];
  title: string;
  w: number;
  h: number;
  language?: "ar" | "en";
  themeId?: CaptionThemeId | string;
  readMode?: CaptionReadMode;
}): string {
  const { words, title, w, h } = opts;
  const sample = words.map((x) => x.word).join(" ") || title;
  const lang = opts.language || detectScriptLanguage(sample);
  return buildAssCaptions(
    [
      {
        id: 0,
        start: 0,
        end: Math.max(...words.map((x) => x.end), 1),
        text: sample,
        words,
      },
    ],
    0,
    Math.max(...words.map((x) => x.end), 1),
    title,
    lang,
    {
      themeId: opts.themeId,
      readMode: opts.readMode || "readable",
      highlightMode: "word",
      playResX: w,
      playResY: h,
    },
  );
}

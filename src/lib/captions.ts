import type { TranscriptSegment, TranscriptWord } from "./types";
import { detectScriptLanguage } from "./topic-title";
import {
  animTags,
  balanceTwoLines,
  displayCaptionWord,
  phraseCaptionBlocks,
  polishCaptionWords,
  resolveCaptionTheme,
  type CaptionHighlightMode,
  type CaptionReadMode,
  type CaptionThemeId,
} from "./caption-polish";
import { speakerAssColor } from "./diarize";

export type { CaptionThemeId, CaptionReadMode, CaptionHighlightMode };
export { CAPTION_THEMES, resolveCaptionTheme } from "./caption-polish";

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

function wrapTitle(title: string, lang: "ar" | "en", maxChars = 24): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [lang === "ar" ? "مقطع" : "CLIP"];
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
      if (lines.length >= 2) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < 3) lines.push(line);
  return lang === "en" ? lines.map((l) => l.toUpperCase()) : lines;
}

function wordsInRange(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const seg of segments) {
    for (const w of seg.words) {
      if (w.end > start && w.start < end && w.word.trim()) {
        words.push({
          word: w.word.trim(),
          start: Math.max(0, w.start - start),
          end: Math.max(0.05, w.end - start),
          speakerId: w.speakerId,
        });
      }
    }
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
};

/**
 * Premium viral captions — polished phrases + karaoke highlight + themes.
 * Backwards compatible: old callers still work with defaults.
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
  const lang = language || detectScriptLanguage(sample);
  const duration = Math.max(clipEnd - clipStart, 1);
  const theme = resolveCaptionTheme(options?.themeId);
  const readMode = options?.readMode || "readable";
  const highlightMode = options?.highlightMode || "word";
  const emojis = options?.emojis !== false;
  const playX = options?.playResX || 1080;
  const playY = options?.playResY || 1920;

  const polished = polishCaptionWords(rawWords, {
    lang,
    mode: readMode,
    emojis,
  });
  const blocks = phraseCaptionBlocks(polished, { lang });

  const bodyFont = lang === "ar" ? theme.arabicFont : theme.font;
  const titleFont = bodyFont;
  const bodySize = lang === "ar" ? Math.round(theme.size * 0.92) : theme.size;
  const titleSize = Math.round(bodySize * 0.88);
  const bold = theme.bold ? -1 : 0;
  const titleEnd = Math.min(2.8, duration * 0.16);
  const titleLines = wrapTitle(clipTitle, lang);

  const header = `[Script Info]
Title: Clippers Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${playX}
PlayResY: ${playY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,${bodyFont},${bodySize},${theme.primary},&H000000FF,${theme.outline},${theme.back},${bold},0,0,0,100,100,0,0,1,${theme.outlineW},${theme.shadow},2,70,70,${theme.marginV},1
Style: Title,${titleFont},${titleSize},${theme.highlight},&H000000FF,${theme.outline},&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(6, theme.outlineW)},0,8,50,50,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  const titleText = titleLines.map((l) => escapeAss(l)).join("\\N");
  lines.push(
    `Dialogue: 2,${assTime(0)},${assTime(titleEnd)},Title,,0,0,0,,{\\an8\\fad(100,180)\\bord${theme.outlineW}}${titleText}`,
  );

  if (!blocks.length) {
    const fallback =
      lang === "ar" ? "شوف اللحظة" : escapeAss(clipTitle.slice(0, 40) || "KEY MOMENT");
    lines.push(
      `Dialogue: 0,${assTime(Math.min(titleEnd + 0.15, duration - 0.5))},${assTime(Math.min(titleEnd + 2.2, duration))},Word,,0,0,0,,{\\fad(100,100)}${fallback}`,
    );
    return header + lines.join("\n") + "\n";
  }

  for (const chunk of blocks) {
    const lineStart = Math.max(0, chunk[0].start);
    const lineEnd = Math.max(chunk[chunk.length - 1].end, lineStart + 0.32);

    // Base readable phrase (dim) for the whole phrase duration
    const phraseText = balanceTwoLines(
      chunk
        .map((cw) => {
          let t = displayCaptionWord(cw.word, lang, theme);
          if (cw.emoji) t = `${t} ${cw.emoji}`;
          return escapeAss(t);
        })
        .join(" "),
    );

    if (highlightMode === "line" || highlightMode === "phrase") {
      lines.push(
        `Dialogue: 0,${assTime(lineStart)},${assTime(lineEnd)},Word,,0,0,0,,{\\an2\\fad(40,40)\\bord${theme.outlineW}\\shad${theme.shadow}${animTags(theme.anim, true, bodySize, theme.highlight, theme.primary)}}${phraseText}`,
      );
      continue;
    }

    // Word karaoke: base line + active word overlays
    lines.push(
      `Dialogue: 0,${assTime(lineStart)},${assTime(lineEnd)},Word,,0,0,0,,{\\an2\\fad(40,40)\\bord${theme.outlineW}\\alpha&H60&}${phraseText}`,
    );

    for (let wi = 0; wi < chunk.length; wi++) {
      const w = chunk[wi];
      const speakerColor =
        w.speakerId != null ? speakerAssColor(w.speakerId) : theme.highlight;
      const painted = chunk
        .map((cw, cwi) => {
          let raw = displayCaptionWord(cw.word, lang, theme);
          if (cw.emoji && cwi === wi) raw = `${raw} ${cw.emoji}`;
          const t = escapeAss(raw);
          const active = cwi === wi;
          const strong = active || Boolean(cw.emphasis && cwi === wi);
          const hi =
            cw.speakerId != null ? speakerAssColor(cw.speakerId) : speakerColor;
          const tags = animTags(
            theme.anim,
            strong,
            bodySize,
            hi,
            theme.primary,
          );
          return `{${tags}}${cwi === 0 ? "" : " "}${t}`;
        })
        .join("");
      lines.push(
        `Dialogue: 1,${assTime(w.start)},${assTime(Math.max(w.end, w.start + 0.1))},Word,,0,0,0,,{\\an2\\bord${theme.outlineW}}${painted}`,
      );
    }
  }

  return header + lines.join("\n") + "\n";
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

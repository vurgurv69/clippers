import type { TranscriptSegment, TranscriptWord } from "./types";
import { detectScriptLanguage } from "./topic-title";

const HIGHLIGHT_COLORS = ["&H0000E5FF", "&H0000FF9C", "&H004D6AFF", "&H00FF4DFF"];

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
  // English titles pop in caps; Arabic keeps natural script
  return lang === "en" ? lines.map((l) => l.toUpperCase()) : lines;
}

function displayWord(word: string, lang: "ar" | "en") {
  return lang === "en" ? word.toUpperCase() : word;
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
        });
      }
    }
  }
  words.sort((a, b) => a.start - b.start);
  return words;
}

/** Viral captions in Arabic or English + on-screen topic title. */
export function buildAssCaptions(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
  clipTitle: string,
  language?: "ar" | "en",
): string {
  const words = wordsInRange(segments, clipStart, clipEnd);
  const sample = words.map((w) => w.word).join(" ") || clipTitle;
  const lang = language || detectScriptLanguage(sample);
  const duration = Math.max(clipEnd - clipStart, 1);
  const titleLines = wrapTitle(clipTitle, lang);
  const titleEnd = Math.min(3.2, duration * 0.2);

  // Arial/Tahoma render Arabic well on Windows; Arial Black is Latin-focused
  const bodyFont = lang === "ar" ? "Tahoma" : "Arial Black";
  const titleFont = lang === "ar" ? "Tahoma" : "Arial Black";
  const bodySize = lang === "ar" ? 68 : 72;
  const titleSize = lang === "ar" ? 58 : 64;

  const header = `[Script Info]
Title: Clippers Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,${bodyFont},${bodySize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,0,2,60,60,420,1
Style: Title,${titleFont},${titleSize},&H0000E5FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,0,8,50,50,160,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  const titleText = titleLines.map((l) => escapeAss(l)).join("\\N");
  lines.push(
    `Dialogue: 2,${assTime(0)},${assTime(titleEnd)},Title,,0,0,0,,{\\an8\\fad(120,200)\\bord8\\shad0\\c&H0000E5FF&}${titleText}`,
  );

  if (!words.length) {
    const fallback = lang === "ar" ? "شوف اللحظة" : escapeAss(clipTitle.slice(0, 40) || "KEY MOMENT");
    lines.push(
      `Dialogue: 0,${assTime(Math.min(titleEnd + 0.2, duration - 0.5))},${assTime(Math.min(titleEnd + 2.5, duration))},Word,,0,0,0,,{\\fad(120,120)\\c&H0000FF9C&}${fallback}`,
    );
    return header + lines.join("\n") + "\n";
  }

  const chunkSize = lang === "ar" ? 3 : 4;

  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize);
    const lineStart = chunk[0].start;
    const lineEnd = Math.max(chunk[chunk.length - 1].end, lineStart + 0.35);
    const color = HIGHLIGHT_COLORS[Math.floor(i / chunkSize) % HIGHLIGHT_COLORS.length];

    const painted = chunk
      .map((cw, cwi) => {
        const t = escapeAss(displayWord(cw.word, lang));
        if (cwi === 0) return `{\\c${color}\\fs${bodySize + 8}\\b1}${t}`;
        return `{\\c&H00FFFFFF&\\fs${bodySize}\\b1} ${t}`;
      })
      .join("");

    lines.push(
      `Dialogue: 0,${assTime(lineStart)},${assTime(lineEnd)},Word,,0,0,0,,{\\an2\\fad(60,60)\\bord6\\shad0}${painted}`,
    );

    for (let wi = 0; wi < chunk.length; wi++) {
      const w = chunk[wi];
      const accent = HIGHLIGHT_COLORS[(i + wi) % HIGHLIGHT_COLORS.length];
      const pop = chunk
        .map((cw, cwi) => {
          const t = escapeAss(displayWord(cw.word, lang));
          if (cwi === wi) return `{\\c${accent}\\fs${bodySize + 14}\\b1}${t}`;
          return `{\\c&H00FFFFFF&\\fs${bodySize}\\b1}${cwi === 0 ? "" : " "}${t}`;
        })
        .join(" ");
      lines.push(
        `Dialogue: 1,${assTime(w.start)},${assTime(Math.max(w.end, w.start + 0.12))},Word,,0,0,0,,{\\an2\\bord6}${pop}`,
      );
    }
  }

  return header + lines.join("\n") + "\n";
}

/**
 * Studio karaoke ASS for a full timeline canvas (Phase 4).
 * Words are already remapped to timeline seconds by the caller.
 */
export function buildTimelineKaraokeAss(opts: {
  words: TranscriptWord[];
  title: string;
  w: number;
  h: number;
  language?: "ar" | "en";
}): string {
  const { words, title, w, h } = opts;
  const sample = words.map((x) => x.word).join(" ") || title;
  const lang = opts.language || detectScriptLanguage(sample);
  const bodyFont = lang === "ar" ? "Tahoma" : "Arial Black";
  const bodySize = Math.round(Math.min(w, h) * (lang === "ar" ? 0.055 : 0.06));
  const marginV = Math.round(h * 0.22);

  const header = `[Script Info]
Title: Clippers Studio Karaoke
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${w}
PlayResY: ${h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,${bodyFont},${bodySize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,0,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  if (!words.length) return header;

  const lines: string[] = [];
  const chunkSize = lang === "ar" ? 3 : 4;
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize);
    const lineStart = chunk[0].start;
    const lineEnd = Math.max(chunk[chunk.length - 1].end, lineStart + 0.35);
    const color = HIGHLIGHT_COLORS[Math.floor(i / chunkSize) % HIGHLIGHT_COLORS.length];
    const painted = chunk
      .map((cw, cwi) => {
        const t = escapeAss(displayWord(cw.word, lang));
        if (cwi === 0) return `{\\c${color}\\fs${bodySize + 6}\\b1}${t}`;
        return `{\\c&H00FFFFFF&\\fs${bodySize}\\b1} ${t}`;
      })
      .join("");
    lines.push(
      `Dialogue: 0,${assTime(lineStart)},${assTime(lineEnd)},Word,,0,0,0,,{\\an2\\fad(50,50)\\bord5}${painted}`,
    );
  }
  return header + lines.join("\n") + "\n";
}

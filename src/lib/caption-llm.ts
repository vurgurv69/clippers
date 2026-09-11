import { hasLlmKey, llmComplete, parseLlmJson } from "./llm";
import type { TranscriptSegment, TranscriptWord } from "./types";

function clipTranscript(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): string {
  return segments
    .filter((s) => s.start < end && s.end > start)
    .map((s) => `[${Math.max(0, s.start - start).toFixed(1)}-${Math.max(0.1, s.end - start).toFixed(1)}] ${s.text}`)
    .join("\n")
    .slice(0, 8000);
}

function wordsFromLine(text: string, start: number, end: number): TranscriptWord[] {
  const tokens = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return [];
  const span = Math.max(0.2, end - start);
  const slot = span / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: Number((start + i * slot).toFixed(3)),
    end: Number((start + (i + 1) * slot).toFixed(3)),
  }));
}

/**
 * Rewrite a clip's speech into punchy on-screen captions, keeping timing.
 * Falls back to null so the caller can use Whisper polish instead.
 */
export async function llmRewriteClipCaptions(opts: {
  segments: TranscriptSegment[];
  start: number;
  end: number;
  language?: "ar" | "en";
}): Promise<TranscriptSegment[] | null> {
  if (!hasLlmKey()) return null;
  const duration = Math.max(0.5, opts.end - opts.start);
  const transcript = clipTranscript(opts.segments, opts.start, opts.end);
  if (!transcript.trim()) return null;

  const lang = opts.language === "ar" ? "Arabic" : "English";
  const { text, usedLlm } = await llmComplete({
    system: `You write viral on-screen subtitles for short clips.
Return ONLY JSON: {"lines":[{"start":number,"end":number,"text":string}]}
Rules:
- times are seconds from the start of THIS clip (0..${duration.toFixed(1)})
- 2–6 words per line, punchy and readable
- same ${lang} as the speech; keep the meaning
- drop um/uh/you know/يعني fillers
- cover the whole talking part; lines must not overlap
- no hashtags, no "subscribe", no speaker labels`,
    user: `Clip length: ${duration.toFixed(1)}s\nTimed transcript:\n${transcript}`,
    maxTokens: 1800,
    temperature: 0.35,
    json: true,
  });
  if (!usedLlm) return null;

  const parsed = parseLlmJson<{
    lines?: { start?: number; end?: number; text?: string }[];
  }>(text);
  const lines = (parsed?.lines || [])
    .map((l) => {
      const start = Number(l.start);
      const end = Number(l.end);
      const lineText = (l.text || "").replace(/\s+/g, " ").trim();
      if (!lineText || !Number.isFinite(start) || !Number.isFinite(end)) return null;
      const s = Math.max(0, Math.min(duration - 0.12, start));
      const e = Math.max(s + 0.18, Math.min(duration, end));
      return { start: s, end: e, text: lineText };
    })
    .filter((x): x is { start: number; end: number; text: string } => Boolean(x))
    .sort((a, b) => a.start - b.start)
    .slice(0, 80);

  if (!lines.length) return null;

  const words: TranscriptWord[] = [];
  for (const line of lines) {
    words.push(...wordsFromLine(line.text, line.start, line.end));
  }
  if (!words.length) return null;

  const absWords = words.map((w) => ({
    ...w,
    start: w.start + opts.start,
    end: w.end + opts.start,
  }));

  return [
    {
      id: 0,
      start: opts.start,
      end: opts.end,
      text: lines.map((l) => l.text).join(" "),
      words: absWords,
    },
  ];
}

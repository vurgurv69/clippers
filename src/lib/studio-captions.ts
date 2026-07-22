/**
 * Caption burn helpers — shared by Studio AI captions + transcript tools.
 */
import {
  defaultText,
  TEXT_TEMPLATES,
  type TextOverlay,
} from "@/lib/editor-types";
import { captionColorForSpeaker } from "@/lib/ai-edit-prompt";
import { uid } from "@/lib/studio-clip-ops";

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  words?: { speakerId?: number }[];
};

type CapLine = {
  start: number;
  end: number;
  text: string;
  speaker: number;
  important: boolean;
};

/** Merge nearby same-speaker lines into burnable caption overlays. */
export function buildCaptionsFromSegments(
  segments: TranscriptSegment[],
  max = 48,
): TextOverlay[] {
  const captionTpl =
    TEXT_TEMPLATES.find((t) => t.id === "caption")?.apply || {
      size: 0.05,
      y: 0.88,
      bold: true,
      font: "Arial",
      stroke: 2,
      strokeColor: "#000000",
      color: "#ffffff",
      anim: "none" as const,
    };

  const merged: CapLine[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const text = (s.text || "").trim();
    if (!text) continue;
    const start = Math.max(0, s.start);
    const end = Math.max(start + 0.4, s.end);
    const speakerWord = s.words?.find((w) => typeof w.speakerId === "number");
    const speaker = speakerWord?.speakerId ?? i % 4;
    const important = /[!?]|(^|\s)(wait|listen|important|never|always)\b/i.test(text);
    const last = merged[merged.length - 1];
    if (
      last &&
      last.speaker === speaker &&
      start - last.end < 0.15 &&
      last.text.length + text.length < 72
    ) {
      last.end = end;
      last.text = `${last.text} ${text}`.trim();
      last.important = last.important || important;
    } else {
      merged.push({ start, end, text, speaker, important });
    }
  }

  return merged.slice(0, max).map((s) => ({
    ...defaultText(uid("cap"), s.start),
    ...captionTpl,
    text: s.text.slice(0, 90),
    start: s.start,
    duration: Math.min(6, Math.max(0.6, s.end - s.start)),
    y: 0.82,
    size: s.important ? 0.065 : 0.055,
    bold: true,
    stroke: 3,
    strokeColor: "#000000",
    color: captionColorForSpeaker(s.speaker, s.important),
    anim: "none" as const,
    transform: "none" as const,
  }));
}

export function buildManualCaption(opts: {
  text: string;
  start: number;
  duration: number;
  speaker?: number;
  important?: boolean;
}): TextOverlay {
  return {
    ...defaultText(uid("cap"), opts.start),
    text: opts.text,
    start: Math.max(0, opts.start),
    duration: Math.max(0.4, opts.duration),
    y: 0.82,
    size: opts.important ? 0.065 : 0.055,
    bold: true,
    stroke: 3,
    strokeColor: "#000000",
    color: captionColorForSpeaker(opts.speaker ?? 0, opts.important),
    anim: "none" as const,
    transform: "none" as const,
  };
}

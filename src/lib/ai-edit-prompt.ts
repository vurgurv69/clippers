import type { ClipTransform, ColorGrade, TimelineClip } from "@/lib/editor-types";
import { DEFAULT_TRANSFORM } from "@/lib/editor-types";

export type AiEditResult = {
  color?: Partial<ColorGrade>;
  transform?: Partial<ClipTransform>;
  speed?: number;
  summary: string[];
};

/** Parse a plain-English edit request into clip grade / transform patches. */
export function parseEditPrompt(prompt: string): AiEditResult {
  const p = prompt.toLowerCase();
  const summary: string[] = [];
  const color: Partial<ColorGrade> = {};
  const transform: Partial<ClipTransform> = {};
  let speed: number | undefined;

  if (/\b(brighter|brighten|lighter)\b/.test(p)) {
    color.brightness = 1.25;
    color.exposure = 18;
    summary.push("Brighter picture");
  }
  if (/\b(darker|darken|moody)\b/.test(p)) {
    color.brightness = 0.78;
    color.exposure = -15;
    summary.push("Darker / moody");
  }
  if (/\b(warm|warmer|golden|sunset)\b/.test(p)) {
    color.temperature = 45;
    color.saturation = 1.15;
    summary.push("Warmer tones");
  }
  if (/\b(cool|colder|blue|icy)\b/.test(p)) {
    color.temperature = -40;
    summary.push("Cooler tones");
  }
  if (/\b(saturat|vivid|pop)\b/.test(p)) {
    color.saturation = 1.45;
    summary.push("More saturation");
  }
  if (/\b(desaturat|muted|fade.?out.?color|black.?and.?white|b&w|mono)\b/.test(p)) {
    color.saturation = /\b(black.?and.?white|b&w|mono)\b/.test(p) ? 0 : 0.55;
    summary.push(color.saturation === 0 ? "Black & white" : "Muted colors");
  }
  if (/\bvignette\b/.test(p)) {
    color.vignette = 0.55;
    summary.push("Vignette");
  }
  if (/\b(contrast|punchy|crisp)\b/.test(p)) {
    color.contrast = 1.25;
    color.sharpen = 0.6;
    summary.push("More contrast");
  }
  if (/\b(soft|dreamy|hazy)\b/.test(p)) {
    color.contrast = 0.9;
    color.sharpen = 0;
    summary.push("Softer look");
  }
  if (/\b(zoom.?in|closer|bigger)\b/.test(p)) {
    transform.scaleX = 1.25;
    transform.scaleY = 1.25;
    summary.push("Zoom in");
  }
  if (/\b(zoom.?out|wider|smaller)\b/.test(p)) {
    transform.scaleX = 0.85;
    transform.scaleY = 0.85;
    summary.push("Zoom out");
  }
  if (/\b(fade|transparent|ghost)\b/.test(p)) {
    transform.opacity = 0.65;
    summary.push("Lower opacity");
  }
  if (/\b(slow.?mo|slow.?motion|slower)\b/.test(p)) {
    speed = 0.5;
    summary.push("Half speed");
  }
  if (/\b(faster|speed.?up|2x)\b/.test(p)) {
    speed = 1.5;
    summary.push("Faster playback");
  }
  if (/\b(reset|normal|default)\b/.test(p)) {
    return {
      color: {
        brightness: 1,
        contrast: 1,
        saturation: 1,
        sharpen: 0,
        vignette: 0,
        temperature: 0,
        tint: 0,
        exposure: 0,
        preset: "custom",
      },
      transform: { ...DEFAULT_TRANSFORM },
      speed: 1,
      summary: ["Reset look & transform"],
    };
  }

  if (!summary.length) {
    summary.push("No clear edit matched — try: warmer, brighter, zoom in, slow-mo, vignette…");
  }

  return {
    color: Object.keys(color).length ? { ...color, preset: "custom" } : undefined,
    transform: Object.keys(transform).length ? transform : undefined,
    speed,
    summary,
  };
}

export function applyEditResultToClip(
  clip: TimelineClip,
  result: AiEditResult,
): TimelineClip {
  let next = { ...clip };
  if (result.color) {
    next = { ...next, color: { ...next.color, ...result.color } };
  }
  if (result.transform) {
    next = {
      ...next,
      transform: { ...DEFAULT_TRANSFORM, ...(next.transform || {}), ...result.transform },
    };
  }
  if (typeof result.speed === "number") {
    next = { ...next, speed: result.speed };
  }
  return next;
}

/** Speaker / importance → caption colors. */
export const CAPTION_SPEAKER_COLORS = [
  "#f5f5f5",
  "#7dd3fc",
  "#f9a8d4",
  "#86efac",
  "#fcd34d",
  "#c4b5fd",
];

export function captionColorForSpeaker(speaker: number | string | undefined, important?: boolean) {
  if (important) return "#fbbf24";
  if (typeof speaker === "number") {
    return CAPTION_SPEAKER_COLORS[Math.abs(speaker) % CAPTION_SPEAKER_COLORS.length];
  }
  if (typeof speaker === "string" && speaker.trim()) {
    let h = 0;
    for (let i = 0; i < speaker.length; i++) h = (h * 31 + speaker.charCodeAt(i)) | 0;
    return CAPTION_SPEAKER_COLORS[Math.abs(h) % CAPTION_SPEAKER_COLORS.length];
  }
  return "#ffffff";
}

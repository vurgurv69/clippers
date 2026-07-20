/**
 * Thumbnail layout presets + face-biased crop helpers (Phase 6).
 */

export type ThumbnailLayoutPreset = "left-face" | "right-text" | "bold-center";

export const THUMBNAIL_LAYOUT_PRESETS: {
  id: ThumbnailLayoutPreset;
  label: string;
  hint: string;
}[] = [
  { id: "left-face", label: "Left face", hint: "Subject left · minimal text" },
  { id: "right-text", label: "Right text", hint: "Face left · headline right" },
  { id: "bold-center", label: "Bold center", hint: "Centered punch headline" },
];

/** Normalize layout id from query/body. */
export function parseThumbnailLayout(raw?: string | null): ThumbnailLayoutPreset {
  if (raw === "left-face" || raw === "right-text" || raw === "bold-center") {
    return raw;
  }
  return "bold-center";
}

/** Face center 0..1 from suggestReframeTransform x/y (-1..1 from center). */
export function faceCenterFromTransform(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: Math.max(0.08, Math.min(0.92, 0.5 - x / 2)),
    cy: Math.max(0.08, Math.min(0.92, 0.5 - y / 2)),
  };
}

/** Blend detected face center with preset bias. */
export function layoutFaceCenter(
  layout: ThumbnailLayoutPreset,
  detected?: { cx: number; cy: number } | null,
): { cx: number; cy: number } {
  const preset =
    layout === "left-face"
      ? { cx: 0.32, cy: 0.38 }
      : layout === "right-text"
        ? { cx: 0.28, cy: 0.4 }
        : { cx: 0.5, cy: 0.42 };

  if (!detected) return preset;
  const weight = layout === "bold-center" ? 0.72 : 0.55;
  return {
    cx: detected.cx * weight + preset.cx * (1 - weight),
    cy: detected.cy * weight + preset.cy * (1 - weight),
  };
}

/** Scale-to-cover then crop centered on face. */
export function buildFaceBiasedVf(
  w: number,
  h: number,
  cx: number,
  cy: number,
): string {
  const cxClamped = Math.max(0.1, Math.min(0.9, cx));
  const cyClamped = Math.max(0.1, Math.min(0.9, cy));
  return [
    `scale=${w}:${h}:force_original_aspect_ratio=increase`,
    `crop=${w}:${h}:(iw-${w})*${cxClamped.toFixed(4)}:(ih-${h})*${cyClamped.toFixed(4)}`,
  ].join(",");
}

function hexColor(c?: string, fallback = "white"): string {
  if (c && /^#[0-9a-fA-F]{6}$/.test(c)) return `0x${c.slice(1)}`;
  return fallback;
}

/** FFmpeg drawtext for layout preset. */
export function buildHeadlineDrawtext(
  headline: string,
  w: number,
  layout: ThumbnailLayoutPreset,
  primary?: string,
  accent?: string,
): string {
  const safe = headline
    .replace(/\\/g, "")
    .replace(/:/g, "\\:")
    .replace(/'/g, "")
    .replace(/%/g, "");
  const fontColor = hexColor(primary, "white");
  const borderColor = hexColor(accent, "black");
  const fs =
    layout === "bold-center"
      ? Math.round(w * 0.075)
      : layout === "right-text"
        ? Math.round(w * 0.055)
        : Math.round(w * 0.045);

  const pos =
    layout === "right-text"
      ? `x=w*0.52:y=(h-text_h)/2`
      : layout === "left-face"
        ? `x=w*0.04:y=h*0.78`
        : `x=(w-text_w)/2:y=h*0.72`;

  return `drawtext=text='${safe}':fontsize=${fs}:fontcolor=${fontColor}:borderw=5:bordercolor=${borderColor}:${pos}`;
}

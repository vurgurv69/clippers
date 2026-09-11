import { parseCaptionsEnabled } from "./captions-flag";
import {
  CAPTION_FONTS,
  clampFontSize,
  clampOutline,
  type CaptionAlign,
  type CaptionFontFamily,
} from "./caption-style";
import { clampClipCount } from "./parse-time";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ClipMode,
  DownloadHint,
  ExportCodec,
  ExportQuality,
  LayoutMode,
  WhisperQuality,
} from "./types";

const MODES: ClipMode[] = ["viral", "social"];

const ALIGNS: CaptionAlign[] = ["bottom", "middle", "top"];

const ASPECTS: AspectRatio[] = ["9:16", "1:1", "4:5", "16:9"];
const LAYOUTS: LayoutMode[] = ["auto", "fill", "face-top"];
const HINTS: DownloadHint[] = [
  "auto",
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "x",
  "twitch",
  "kick",
  "vimeo",
];
const WHISPER: WhisperQuality[] = ["fast", "balanced", "best"];
const CAP_MODES: CaptionReadMode[] = ["verbatim", "readable", "minimal"];
const THEMES: CaptionThemeId[] = [
  "tiktok-clean",
  "tiktok-bold",
  "hormozi",
  "podcast",
  "gaming",
  "minimal",
  "cinematic",
  "luxury",
  "neon",
  "youtube-shorts",
  "instagram-reels",
];
const EXPORT_Q: ExportQuality[] = ["high", "very-high", "maximum"];
const CODECS: ExportCodec[] = ["h264", "hevc", "av1", "vp9"];

export type ParsedJobOptions = {
  aspectRatio: AspectRatio;
  layoutMode: LayoutMode;
  captionsEnabled: boolean;
  downloadHint: DownloadHint;
  whisperQuality: WhisperQuality;
  captionTheme: CaptionThemeId;
  captionReadMode: CaptionReadMode;
  captionEmojis: boolean;
  exportQuality: ExportQuality;
  exportCodec: ExportCodec;
  preferHwEncode: boolean;
  clipCount: number;
  manualStartTime?: string;
  manualEndTime?: string;
  captionPrimary?: string;
  captionHighlight?: string;
  captionFont?: CaptionFontFamily;
  captionAlign?: CaptionAlign;
  captionFontSize?: number;
  captionOutline?: number;
  captionBox?: boolean;
  removeWatermark?: boolean;
  clipMode?: ClipMode;
  stripBurnIn?: boolean;
};

function pick(
  src: FormData | Record<string, unknown>,
  key: string,
): unknown {
  if (typeof FormData !== "undefined" && src instanceof FormData) {
    return src.get(key);
  }
  return (src as Record<string, unknown>)[key];
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function asColor(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  if (
    /^#?[0-9A-Fa-f]{6}$/.test(text) ||
    /^#?[0-9A-Fa-f]{8}$/.test(text) ||
    /^&H[0-9A-Fa-f]{6,8}$/.test(text)
  ) {
    return text.startsWith("#") || text.startsWith("&") ? text : `#${text}`;
  }
  return undefined;
}

export function parseJobOptions(
  src: FormData | Record<string, unknown>,
): ParsedJobOptions {
  const aspectRaw = asString(pick(src, "aspectRatio")) || "9:16";
  const layoutRaw = asString(pick(src, "layoutMode")) || "auto";
  const hintRaw = asString(pick(src, "downloadHint")) || "auto";
  const whisperRaw = asString(pick(src, "whisperQuality")) || "fast";
  const themeRaw = asString(pick(src, "captionTheme")) || "tiktok-bold";
  const readRaw = asString(pick(src, "captionReadMode")) || "readable";
  const exportRaw = asString(pick(src, "exportQuality")) || "very-high";
  const codecRaw = asString(pick(src, "exportCodec")) || "h264";
  const preferRaw = pick(src, "preferHwEncode");
  const emojiRaw = pick(src, "captionEmojis");
  const startRaw = asString(pick(src, "manualStartTime"));
  const endRaw = asString(pick(src, "manualEndTime"));

  return {
    aspectRatio: ASPECTS.includes(aspectRaw as AspectRatio)
      ? (aspectRaw as AspectRatio)
      : "9:16",
    layoutMode: LAYOUTS.includes(layoutRaw as LayoutMode)
      ? (layoutRaw as LayoutMode)
      : "auto",
    captionsEnabled: parseCaptionsEnabled(pick(src, "captionsEnabled"), true),
    downloadHint: HINTS.includes(hintRaw as DownloadHint)
      ? (hintRaw as DownloadHint)
      : "auto",
    whisperQuality: WHISPER.includes(whisperRaw as WhisperQuality)
      ? (whisperRaw as WhisperQuality)
      : "fast",
    captionTheme: THEMES.includes(themeRaw as CaptionThemeId)
      ? (themeRaw as CaptionThemeId)
      : "tiktok-bold",
    captionReadMode: CAP_MODES.includes(readRaw as CaptionReadMode)
      ? (readRaw as CaptionReadMode)
      : "readable",
    captionEmojis: emojiRaw !== false && emojiRaw !== "false",
    exportQuality: EXPORT_Q.includes(exportRaw as ExportQuality)
      ? (exportRaw as ExportQuality)
      : "very-high",
    exportCodec: CODECS.includes(codecRaw as ExportCodec)
      ? (codecRaw as ExportCodec)
      : "h264",
    preferHwEncode: preferRaw !== false && preferRaw !== "false",
    clipCount: clampClipCount(pick(src, "clipCount"), 4),
    manualStartTime: startRaw || undefined,
    manualEndTime: endRaw || undefined,
    captionPrimary: asColor(pick(src, "captionPrimary")),
    captionHighlight: asColor(pick(src, "captionHighlight")),
    captionFont: CAPTION_FONTS.includes(asString(pick(src, "captionFont")) as CaptionFontFamily)
      ? (asString(pick(src, "captionFont")) as CaptionFontFamily)
      : "Montserrat",
    captionAlign: ALIGNS.includes(asString(pick(src, "captionAlign")) as CaptionAlign)
      ? (asString(pick(src, "captionAlign")) as CaptionAlign)
      : "bottom",
    captionFontSize: clampFontSize(pick(src, "captionFontSize"), 72),
    captionOutline: clampOutline(pick(src, "captionOutline"), 6),
    captionBox: pick(src, "captionBox") === true || pick(src, "captionBox") === "true",
    removeWatermark: pick(src, "removeWatermark") !== false && pick(src, "removeWatermark") !== "false",
    clipMode: MODES.includes(asString(pick(src, "clipMode")) as ClipMode)
      ? (asString(pick(src, "clipMode")) as ClipMode)
      : "viral",
    stripBurnIn: pick(src, "stripBurnIn") === true || pick(src, "stripBurnIn") === "true",
  };
}

export { HINTS };

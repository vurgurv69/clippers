import type { AspectRatio } from "./types";
import type {
  BrandKit,
  CalendarEvent,
  GrowthPack,
  AiSuggestion,
} from "./growth-types";

/**
 * Multi-clip project editor model. A project owns a set of uploaded assets
 * (videos / images / audio) and an ordered timeline of clips built from them.
 * The same shape is produced by the browser UI and consumed by the ffmpeg
 * export renderer, so preview and export stay consistent.
 */

export type AssetKind = "video" | "image" | "audio" | "lut" | "font";

export type ProjectAsset = {
  id: string;
  kind: AssetKind;
  name: string; // original display name
  filename: string; // stored file on disk
  width?: number;
  height?: number;
  duration: number; // seconds (0 for images until a clip sets one)
  hasAudio: boolean;
  /** Optional low-res proxy filename for snappy preview (export always uses `filename`). */
  proxyFile?: string;
  /** Smart tags from upload heuristics (Phase 2). */
  tags?: string[];
};

export type TransitionKind =
  | "none"
  | "crossfade"
  | "zoom"
  | "slide"
  | "blur"
  | "spin"
  | "warp"
  | "fadeblack"
  // --- expanded set (Phase 6) ---
  | "fadewhite"
  | "whip"
  | "push"
  | "pull"
  | "flash"
  | "filmburn"
  | "shake"
  | "circlewipe"
  | "clockwipe"
  | "glitch"
  | "morph"
  | "liquid"
  | "pageturn"
  | "cube"
  | "flip"
  | "stretch"
  | "wipeup"
  | "wipedown"
  | "dissolve";

/** UI metadata for the transition picker (label + optional favorite grouping). */
export const TRANSITION_DEFS: { id: TransitionKind; label: string }[] = [
  { id: "none", label: "Cut" },
  { id: "crossfade", label: "Crossfade" },
  { id: "dissolve", label: "Dissolve" },
  { id: "fadeblack", label: "Dip Black" },
  { id: "fadewhite", label: "Fade White" },
  { id: "flash", label: "Flash" },
  { id: "zoom", label: "Zoom" },
  { id: "slide", label: "Slide" },
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "whip", label: "Whip" },
  { id: "blur", label: "Blur" },
  { id: "spin", label: "Spin" },
  { id: "warp", label: "Warp" },
  { id: "liquid", label: "Liquid" },
  { id: "morph", label: "Morph" },
  { id: "glitch", label: "Glitch" },
  { id: "shake", label: "Shake" },
  { id: "filmburn", label: "Film Burn" },
  { id: "circlewipe", label: "Circle Wipe" },
  { id: "clockwipe", label: "Clock Wipe" },
  { id: "pageturn", label: "Page Turn" },
  { id: "cube", label: "Cube" },
  { id: "flip", label: "Flip" },
  { id: "stretch", label: "Stretch" },
  { id: "wipeup", label: "Wipe Up" },
  { id: "wipedown", label: "Wipe Down" },
];

export type ColorGrade = {
  brightness: number; // 0..2 (1 = normal)
  contrast: number; // 0..2 (1 = normal)
  saturation: number; // 0..3 (1 = normal)
  sharpen: number; // 0..2 (0 = off)
  vignette: number; // 0..1 (0 = off)
  // --- pro grading (Phase 11, all optional; 0 = neutral) ---
  temperature?: number; // -100 (cool) .. 100 (warm)
  tint?: number; // -100 (green) .. 100 (magenta)
  exposure?: number; // -100 .. 100
  highlights?: number; // -100 .. 100
  shadows?: number; // -100 .. 100
  whites?: number; // -100 .. 100
  blacks?: number; // -100 .. 100
  /** Simple master curve pivot (-100..100). 0 = linear. */
  curve?: number;
  /** HSL hue rotate in degrees (-180..180). */
  hueShift?: number;
  /** HSL lightness offset (-100..100). */
  lightness?: number;
  /** Lift / Gamma / Gain wheels (−100..100). Mapped into shadows/mid/highlights bake. */
  lift?: number;
  gamma?: number;
  gain?: number;
  /** Optional .cube LUT filename stored in project assets/cache. */
  lut?: string;
  preset?: string; // id of a named preset, for UI only
};

/** Timeline marker / chapter cue. */
export type TimelineMarker = {
  id: string;
  t: number;
  label: string;
  color?: string;
};

/**
 * Stackable visual effects applied to a single clip, in order. Each maps to a
 * real ffmpeg filter for export and (where possible) a CSS approximation for
 * the live preview. `amount` is a generic 0..100 strength the UI can drag.
 */
export type EffectKind =
  | "blur"
  | "sharpen"
  | "grain"
  | "pixelate"
  | "rgbsplit"
  | "hue"
  | "vignette"
  | "motionblur"
  | "emboss"
  | "mirror"
  | "glow"
  | "shadow"
  | "shake"
  | "bloom"
  | "wave"
  | "tint"
  | "posterize"
  | "negate";

export type ClipEffect = {
  id: string;
  kind: EffectKind;
  enabled: boolean;
  amount: number; // 0..100 generic strength
};

export const EFFECT_DEFS: {
  kind: EffectKind;
  label: string;
  hint: string;
  hasAmount: boolean;
  defaultAmount: number;
}[] = [
  { kind: "blur", label: "Blur", hint: "Soft gaussian blur", hasAmount: true, defaultAmount: 30 },
  { kind: "sharpen", label: "Sharpen", hint: "Crisp detail", hasAmount: true, defaultAmount: 40 },
  { kind: "grain", label: "Film Grain", hint: "Analog noise", hasAmount: true, defaultAmount: 25 },
  { kind: "pixelate", label: "Pixelate", hint: "Mosaic blocks", hasAmount: true, defaultAmount: 30 },
  { kind: "rgbsplit", label: "RGB Split", hint: "Chromatic offset", hasAmount: true, defaultAmount: 30 },
  { kind: "hue", label: "Hue Shift", hint: "Rotate colors", hasAmount: true, defaultAmount: 50 },
  { kind: "vignette", label: "Vignette", hint: "Dark edges", hasAmount: true, defaultAmount: 40 },
  { kind: "motionblur", label: "Motion Blur", hint: "Frame smear", hasAmount: true, defaultAmount: 40 },
  { kind: "glow", label: "Glow", hint: "Soft bloom glow", hasAmount: true, defaultAmount: 40 },
  { kind: "bloom", label: "Bloom", hint: "Highlight bloom", hasAmount: true, defaultAmount: 35 },
  { kind: "shadow", label: "Shadow", hint: "Drop shadow edge", hasAmount: true, defaultAmount: 40 },
  { kind: "shake", label: "Shake", hint: "Camera shake", hasAmount: true, defaultAmount: 35 },
  { kind: "wave", label: "Wave", hint: "Wavy distortion", hasAmount: true, defaultAmount: 30 },
  { kind: "tint", label: "Color Tint", hint: "Emerald tint wash", hasAmount: true, defaultAmount: 40 },
  { kind: "posterize", label: "Posterize", hint: "Flat color bands", hasAmount: true, defaultAmount: 40 },
  { kind: "negate", label: "Negative", hint: "Invert colors", hasAmount: false, defaultAmount: 100 },
  { kind: "emboss", label: "Emboss", hint: "Relief look", hasAmount: false, defaultAmount: 100 },
  { kind: "mirror", label: "Mirror", hint: "Flip horizontally", hasAmount: false, defaultAmount: 100 },
];

export function defaultEffect(kind: EffectKind, id: string): ClipEffect {
  const def = EFFECT_DEFS.find((d) => d.kind === kind);
  return { id, kind, enabled: true, amount: def?.defaultAmount ?? 50 };
}

/**
 * Background-music track that can be positioned, trimmed and faded on its own
 * lane under the video timeline. `start` is where it begins on the timeline;
 * `inPoint`/`outPoint` trim the source audio.
 */
export type MusicTrack = {
  assetId: string;
  start: number; // seconds offset on the timeline
  inPoint: number; // trim start inside the source
  outPoint: number; // trim end inside the source
  volume: number; // 0..2
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  /**
   * When set, this music lane is linked A/V for a video clip — start/trim
   * follow that clip as it moves on the timeline.
   */
  linkedClipId?: string;
  /** Auto-duck this bed when dialogue/clips play (0..1 depth). */
  duck?: number;
};

/** Animation applied when a text overlay enters/leaves the screen. */
export type TextAnim = "none" | "fade" | "slide" | "pop" | "zoom";
export type TextAlign = "left" | "center" | "right";

export type TextTransform = "none" | "upper" | "lower";

/** A caption / title block living on the text lane. */
export type TextOverlay = {
  id: string;
  text: string;
  start: number; // seconds on the timeline
  duration: number; // seconds visible
  x: number; // 0..1 horizontal center (0.5 = middle)
  y: number; // 0..1 vertical center
  size: number; // 0.02..0.3 fraction of frame width
  color: string; // hex, e.g. #ffffff
  align: TextAlign;
  bold: boolean;
  italic?: boolean;
  underline?: boolean;
  anim: TextAnim;
  // --- rich styling (Phase 7, all optional for back-compat) ---
  font?: string; // font family name
  stroke?: number; // outline width in px (0 = none)
  strokeColor?: string;
  shadow?: number; // drop-shadow depth in px (0 = none)
  shadowColor?: string;
  bg?: boolean; // draw a background box behind the text
  bgColor?: string;
  bgOpacity?: number; // 0..1
  opacity?: number; // 0..1 text opacity
  letterSpacing?: number; // px
  lineHeight?: number; // 0.8..2 — baked to ASS ScaleY on export
  transform?: TextTransform; // upper / lower casing
  /** Uploaded font filename in project assets (optional). */
  fontFile?: string;
  /** Arc bend for curved text (−100..100). 0 = flat. */
  curve?: number;
  /** Extra per-glyph kerning in px (−20..40). */
  kerning?: number;
  /** Optional sticker URL (SVG / Lottie) rendered in preview. */
  stickerUrl?: string;
  stickerLottie?: boolean;
  /**
   * Multi-style rich runs. When set, `text` is the joined plain fallback;
   * preview/export prefer `runs`.
   */
  runs?: TextRun[];
};

export type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};

/**
 * Curated fonts for titles, captions, and lower-thirds.
 * Prefer faces that are common on Windows / Mac for reliable preview + export.
 */
export const TEXT_FONTS: string[] = [
  "Inter",
  "Arial",
  "Helvetica",
  "Arial Black",
  "Impact",
  "Montserrat",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Lato",
  "Georgia",
  "Times New Roman",
  "Palatino Linotype",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
];

/** Quick stickers / emoji / shapes dropped onto the text lane. */
export const STICKER_PRESETS: { id: string; label: string; glyph: string }[] = [
  { id: "star", label: "Star", glyph: "★" },
  { id: "heart", label: "Heart", glyph: "♥" },
  { id: "fire", label: "Fire", glyph: "🔥" },
  { id: "clap", label: "Clap", glyph: "👏" },
  { id: "arrow", label: "Arrow", glyph: "➤" },
  { id: "check", label: "Check", glyph: "✓" },
  { id: "warn", label: "Warn", glyph: "⚠" },
  { id: "speech", label: "Speech", glyph: "💬" },
  { id: "circle", label: "Circle", glyph: "●" },
  { id: "square", label: "Square", glyph: "■" },
  { id: "tri", label: "Triangle", glyph: "▲" },
  { id: "spark", label: "Sparkles", glyph: "✨" },
];

/** SVG / motion sticker pack (served from /stickers). */
export const STICKER_PACK: {
  id: string;
  label: string;
  src: string;
  motion?: boolean;
  lottie?: boolean;
}[] = [
  { id: "pack-star", label: "Star", src: "/stickers/star.svg" },
  { id: "pack-heart", label: "Heart", src: "/stickers/heart.svg" },
  { id: "pack-check", label: "Check", src: "/stickers/check.svg" },
  { id: "pack-bang", label: "Bang", src: "/stickers/bang.svg" },
  { id: "pack-face", label: "Face", src: "/stickers/face.svg" },
  { id: "pack-spin", label: "Spinner", src: "/stickers/spinner.svg", motion: true },
  { id: "pack-pulse", label: "Pulse", src: "/stickers/pulse.json", lottie: true },
  { id: "pack-beat", label: "Heartbeat", src: "/stickers/heartbeat.json", lottie: true },
];

/** One-click text presets for common lower-thirds / titles / captions. */
export const TEXT_TEMPLATES: { id: string; label: string; apply: Partial<TextOverlay> }[] = [
  {
    id: "title",
    label: "Title",
    apply: { size: 0.12, y: 0.28, bold: true, font: "Arial Black", stroke: 3, strokeColor: "#000000", color: "#ffffff", anim: "fade", transform: "upper" },
  },
  {
    id: "subtitle",
    label: "Subtitle",
    apply: { size: 0.06, y: 0.42, bold: false, font: "Arial", stroke: 2, strokeColor: "#000000", color: "#ffffff", anim: "fade", transform: "none" },
  },
  {
    id: "lower3",
    label: "Lower Third",
    apply: { size: 0.055, x: 0.28, y: 0.82, align: "left", bold: true, font: "Arial", bg: true, bgColor: "#059669", bgOpacity: 0.9, color: "#ffffff", stroke: 0, anim: "slide" },
  },
  {
    id: "youtube",
    label: "YouTube Intro",
    apply: { size: 0.14, y: 0.5, bold: true, font: "Impact", stroke: 4, strokeColor: "#000000", color: "#ffde00", anim: "slide", transform: "upper" },
  },
  {
    id: "callout",
    label: "Callout",
    apply: { size: 0.07, y: 0.5, bold: true, font: "Arial Black", bg: true, bgColor: "#111111", bgOpacity: 0.75, color: "#ffffff", anim: "fade" },
  },
  {
    id: "caption",
    label: "Caption",
    apply: { size: 0.05, y: 0.88, bold: true, font: "Arial", stroke: 2, strokeColor: "#000000", color: "#ffffff", anim: "none" },
  },
  {
    id: "quote",
    label: "Quote",
    apply: { size: 0.065, y: 0.5, bold: false, font: "Georgia", color: "#ffffff", stroke: 1, strokeColor: "#000000", anim: "fade", transform: "none" },
  },
];

/** Interpolation curve between keyframes. */
export type KeyframeEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "bezier";

/** Cubic-bezier control points [x1, y1, x2, y2], CSS-style (x in 0..1). */
export type BezierHandles = [number, number, number, number];

export const DEFAULT_BEZIER: BezierHandles = [0.42, 0, 0.58, 1];

export const KEYFRAME_EASES: { id: KeyframeEase; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "easeIn", label: "Ease In" },
  { id: "easeOut", label: "Ease Out" },
  { id: "easeInOut", label: "Ease In-Out" },
  { id: "bezier", label: "Bezier" },
];

/**
 * A diamond on the clip. `t` is 0..1 through the clip's timeline span.
 * Only set properties are animated; missing ones stay at the clip's base value.
 */
export type KeyframeProp =
  | "opacity"
  | "volume"
  | "x"
  | "y"
  | "scaleX"
  | "scaleY"
  | "rotation"
  | "brightness";

export type ClipKeyframe = {
  id: string;
  t: number;
  opacity?: number;
  volume?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  brightness?: number;
  ease?: KeyframeEase;
  /** Used when ease === "bezier". */
  bezier?: BezierHandles;
};

function bezier1d(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Sample a unit cubic-bezier easing curve at progress u (0..1). */
export function cubicBezierProgress(handles: BezierHandles | undefined, u: number): number {
  const [x1, y1, x2, y2] = handles || DEFAULT_BEZIER;
  const target = Math.min(1, Math.max(0, u));
  // Binary-search the curve parameter so Bx(s) ≈ target, then return By(s).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const x = bezier1d(mid, 0, x1, x2, 1);
    if (x < target) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  return bezier1d(s, 0, y1, y2, 1);
}

export function easeProgress(
  e: KeyframeEase | undefined,
  u: number,
  bezier?: BezierHandles,
): number {
  const x = Math.min(1, Math.max(0, u));
  switch (e || "linear") {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "bezier":
      return cubicBezierProgress(bezier, x);
    default:
      return x;
  }
}

/** Sample a keyframed property at normalized time t (0..1). */
export function sampleKeyframe(
  keys: ClipKeyframe[] | undefined,
  prop: KeyframeProp,
  t: number,
  fallback: number,
): number {
  if (!keys || !keys.length) return fallback;
  const sorted = keys
    .filter((k) => typeof k[prop] === "number")
    .slice()
    .sort((a, b) => a.t - b.t);
  if (!sorted.length) return fallback;
  if (t <= sorted[0].t) return sorted[0][prop] as number;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1][prop] as number;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = Math.max(1e-6, b.t - a.t);
      const ease = b.ease || a.ease;
      const bez = b.bezier || a.bezier;
      const u = easeProgress(ease, (t - a.t) / span, bez);
      const av = a[prop] as number;
      const bv = b[prop] as number;
      return av + (bv - av) * u;
    }
  }
  return fallback;
}

/** Spatial transform for a clip (optional — missing = identity). */
export type ClipTransform = {
  x: number; // -1..1 horizontal offset from center
  y: number; // -1..1 vertical offset from center
  scaleX: number; // 0.1..3
  scaleY: number; // 0.1..3
  rotation: number; // degrees
  opacity: number; // 0..1
};

export const DEFAULT_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

/** Named overlay layer stacked on a clip (preview + inspector). */
export type ClipLayer = {
  id: string;
  name: string;
  /** Optional media; empty layers show a numbered placeholder until assigned. */
  assetId?: string;
  enabled?: boolean;
  opacity?: number;
};

export type TimelineClip = {
  id: string;
  assetId: string;
  /** Trim window inside the source (seconds). For images: 0..duration. */
  inPoint: number;
  outPoint: number;
  /** Playback speed multiplier (0.25..4). 1 = normal. */
  speed: number;
  /** Transition applied going INTO the next clip. */
  transition: TransitionKind;
  transitionDuration: number;
  color: ColorGrade;
  /** Spatial transform (optional for back-compat). */
  transform?: ClipTransform;
  /** Ordered stack of visual effects (optional for back-compat). */
  effects?: ClipEffect[];
  /** Animation keyframes (optional for back-compat). */
  keyframes?: ClipKeyframe[];
  /**
   * Video lane: 0 = main (sequential), 1+ = free-placed overlay.
   * Missing = 0 for back-compat.
   */
  lane?: number;
  /**
   * Absolute timeline start for overlay lanes (lane ≥ 1).
   * Ignored for the main sequential track.
   */
  tlStart?: number;
  /**
   * Named visual layers stacked on top of this clip (CapCut-style).
   * Optional for back-compat; base media is always the clip itself.
   */
  layers?: ClipLayer[];
  /** When false, clip audio is treated as unlinked from video (UI hint). */
  linkedAudio?: boolean;
  volume: number; // 0..2
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  /** Per-clip EQ / dynamics (optional for back-compat). */
  bass?: number; // -20..20 dB
  treble?: number; // -20..20 dB
  normalize?: boolean;
  balance?: number; // -1 left .. 1 right
  compress?: number; // 0..1 compressor strength
  limiter?: boolean;
  denoise?: number; // 0..1 noise reduction
  /** Camera shake reduction 0..1 (FFmpeg deshake on export). */
  stabilize?: number;
  /** Noise gate strength 0..1 (silence below threshold). */
  gate?: number;
  /**
   * Adjustment layer: no media — grades/effects blend over clips below.
   * `assetId` may be empty; export uses a lavfi bed.
   */
  adjustment?: boolean;
  /**
   * Nested sequence / compound: `children` play sequentially inside this clip.
   * Export flattens children into the main lane. `assetId` may be empty.
   */
  compound?: boolean;
  children?: TimelineClip[];
  /** Multicam angle group id — sibling angles share this id. */
  multicamId?: string;
  /** When true, this angle is the live cut for its multicam group. */
  multicamActive?: boolean;
  /** Sync offset (seconds) relative to the group master — audio/timecode align. */
  multicamSync?: number;
};

export function clipLane(clip: TimelineClip): number {
  return clip.lane ?? 0;
}

/** Timeline start for a clip given sequential starts for main-lane clips. */
export function clipAbsStart(
  clip: TimelineClip,
  mainStartById: Map<string, number>,
): number {
  if (clipLane(clip) > 0) return Math.max(0, clip.tlStart ?? 0);
  return mainStartById.get(clip.id) ?? 0;
}

/** Per-lane mute / solo / hide / lock chrome (persisted with the project). */
export type TrackId = "video" | "overlay" | "overlay2" | "music" | "text";

export type TrackChrome = {
  name: string;
  locked: boolean;
  muted: boolean;
  solo: boolean;
  hidden: boolean;
  /** Collapse lane body to a thin strip (header stays). */
  collapsed?: boolean;
  height: number;
  color: string;
};

export const DEFAULT_TRACKS: Record<TrackId, TrackChrome> = {
  video: { name: "Video", locked: false, muted: false, solo: false, hidden: false, height: 56, color: "#6b7280" },
  overlay: { name: "V2 Overlay", locked: false, muted: false, solo: false, hidden: false, height: 44, color: "#52525b" },
  overlay2: { name: "V3 Overlay", locked: false, muted: false, solo: false, hidden: false, height: 44, color: "#3f3f46" },
  music: { name: "Audio", locked: false, muted: false, solo: false, hidden: false, height: 56, color: "#71717a" },
  text: { name: "Text", locked: false, muted: false, solo: false, hidden: false, height: 56, color: "#a1a1aa" },
};

export type ProjectSpec = {
  aspect: AspectRatio;
  clips: TimelineClip[];
  /** Primary music lane (kept for back-compat). */
  music?: MusicTrack;
  /** Extra music / SFX lanes mixed under the primary track. */
  musicTracks?: MusicTrack[];
  texts?: TextOverlay[];
  /**
   * When true, V1 clips are free-placed via `tlStart` (gaps/overlaps allowed)
   * instead of packed sequentially. Optional for back-compat.
   */
  freeMain?: boolean;
  /** Optional track chrome (mute/solo/hide/lock/height/name). */
  tracks?: Partial<Record<TrackId, Partial<TrackChrome>>>;
  /** Timeline markers / chapter cues. */
  markers?: TimelineMarker[];
  /** AI Growth Hub — last analyze / suggest results (optional). */
  growthPack?: GrowthPack;
  /** Last AI suggestion markers (optional; also mirrored onto timeline markers). */
  aiMarkers?: AiSuggestion[];
  /** Local brand kit for templates / watermarks. */
  brandKit?: BrandKit;
  /** Simple content calendar events. */
  calendarEvents?: CalendarEvent[];
  /** Smart asset tags (Phase 2 scaffold). */
  smartAssetTags?: Record<string, string[]>;
};

/** Output container/codec chosen in the export window. */
export type ExportFormat = "mp4" | "mov" | "webm" | "gif";
export type ExportCodec = "h264" | "hevc" | "av1" | "vp9";
export type ExportQuality = "low" | "medium" | "high";

export type ExportOptions = {
  format: ExportFormat;
  /** Video codec — mp4/mov: h264|hevc|av1; webm: vp9|av1. Ignored for gif. */
  codec?: ExportCodec;
  /** Scale relative to the 1080p base preset: 720 / 1080 / 1440 / 2160 / 4320. */
  resolution: number;
  fps: number; // 24 / 30 / 60
  quality: ExportQuality;
  /** Prefer GPU encode when available (mp4/mov H.264/HEVC/AV1). */
  hwEncode?: boolean;
  /** Burn word-level karaoke captions from cached Whisper transcript (Phase 4). */
  karaokeCaptions?: boolean;
};

export const DEFAULT_EXPORT: ExportOptions = {
  format: "mp4",
  codec: "h264",
  resolution: 1080,
  fps: 30,
  quality: "high",
  hwEncode: true,
  karaokeCaptions: false,
};

export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "mp4", label: "MP4", hint: "Universal container" },
  { id: "mov", label: "MOV", hint: "QuickTime" },
  { id: "webm", label: "WebM", hint: "Web / smaller" },
  { id: "gif", label: "GIF", hint: "Silent loop" },
];

export const EXPORT_CODECS: { id: ExportCodec; label: string; formats: ExportFormat[] }[] = [
  { id: "h264", label: "H.264", formats: ["mp4", "mov"] },
  { id: "hevc", label: "HEVC", formats: ["mp4", "mov"] },
  { id: "av1", label: "AV1", formats: ["mp4", "mov", "webm"] },
  { id: "vp9", label: "VP9", formats: ["webm"] },
];

export const EXPORT_RESOLUTIONS: { id: number; label: string }[] = [
  { id: 720, label: "720p" },
  { id: 1080, label: "1080p" },
  { id: 1440, label: "1440p" },
  { id: 2160, label: "4K" },
  { id: 4320, label: "8K" },
];

export const EXPORT_FPS: number[] = [24, 30, 60];

export const EXPORT_QUALITIES: { id: ExportQuality; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

export type Project = {
  id: string;
  aspect: AspectRatio;
  assets: ProjectAsset[];
  /** Persisted timeline state for autosave / recovery (optional). */
  spec?: ProjectSpec;
  name?: string;
  createdAt: string;
  updatedAt: string;
  /** Public share token for read-only review (Phase 2). */
  shareToken?: string;
  /** Review comments on the shared cut. */
  comments?: ReviewComment[];
};

export type ReviewComment = {
  id: string;
  t: number;
  text: string;
  author: string;
  createdAt: string;
};

export const COLOR_PRESETS: {
  id: string;
  label: string;
  grade: Omit<ColorGrade, "preset">;
}[] = [
  { id: "none", label: "Original", grade: { brightness: 1, contrast: 1, saturation: 1, sharpen: 0, vignette: 0 } },
  { id: "vivid", label: "Vivid", grade: { brightness: 1.05, contrast: 1.15, saturation: 1.4, sharpen: 0.4, vignette: 0 } },
  { id: "punch", label: "Punch", grade: { brightness: 1.0, contrast: 1.3, saturation: 1.2, sharpen: 0.6, vignette: 0.15 } },
  { id: "warm", label: "Warm", grade: { brightness: 1.08, contrast: 1.05, saturation: 1.25, sharpen: 0.2, vignette: 0.1 } },
  { id: "cinema", label: "Cinema", grade: { brightness: 0.98, contrast: 1.2, saturation: 1.1, sharpen: 0.3, vignette: 0.4 } },
  { id: "mono", label: "B&W", grade: { brightness: 1.05, contrast: 1.2, saturation: 0, sharpen: 0.3, vignette: 0.2 } },
  { id: "faded", label: "Faded", grade: { brightness: 1.1, contrast: 0.85, saturation: 0.8, sharpen: 0, vignette: 0 } },
];

export const DEFAULT_COLOR: ColorGrade = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sharpen: 0,
  vignette: 0,
  temperature: 0,
  tint: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  curve: 0,
  preset: "none",
};

export const IMAGE_DEFAULT_DURATION = 4;

export function defaultClip(asset: ProjectAsset, id: string): TimelineClip {
  const isImage = asset.kind === "image";
  return {
    id,
    assetId: asset.id,
    inPoint: 0,
    outPoint: isImage ? IMAGE_DEFAULT_DURATION : asset.duration || IMAGE_DEFAULT_DURATION,
    speed: 1,
    transition: "none",
    transitionDuration: 0.5,
    color: { ...DEFAULT_COLOR },
    transform: { ...DEFAULT_TRANSFORM },
    effects: [],
    lane: 0,
    linkedAudio: true,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}

/** Raw trimmed source span (seconds), before speed is applied. */
export function clipSourceLength(clip: TimelineClip): number {
  return Math.max(0.05, clip.outPoint - clip.inPoint);
}

/** Duration the clip occupies on the TIMELINE (after speed). */
export function clipLength(clip: TimelineClip): number {
  if (clip.compound && clip.children?.length) {
    return Math.max(
      0.1,
      clip.children.reduce((sum, c) => sum + clipLength(c), 0),
    );
  }
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1;
  return Math.max(0.1, clipSourceLength(clip) / speed);
}

/** Expand compound clips into a flat main-lane list (export / playback lookup). */
export function flattenCompounds(clips: TimelineClip[]): TimelineClip[] {
  const out: TimelineClip[] = [];
  for (const c of clips) {
    if (c.compound && c.children?.length) {
      for (const child of c.children) {
        out.push({ ...child, lane: c.lane ?? 0, tlStart: undefined });
      }
    } else {
      out.push(c);
    }
  }
  return out;
}

/**
 * For multicam: keep only the active angle per group on the main lane;
 * inactive angles are dropped from export (they're alternate takes).
 * Applies `multicamSync` as a source in-point offset so waveform-aligned
 * angles stay in sync when cut live.
 */
export function resolveMulticam(clips: TimelineClip[]): TimelineClip[] {
  const groups = new Map<string, TimelineClip[]>();
  const passthrough: TimelineClip[] = [];
  for (const c of clips) {
    if (c.multicamId) {
      const list = groups.get(c.multicamId) || [];
      list.push(c);
      groups.set(c.multicamId, list);
    } else {
      passthrough.push(c);
    }
  }
  const resolved: TimelineClip[] = [...passthrough];
  for (const [, angles] of groups) {
    const active = angles.find((a) => a.multicamActive) || angles[0];
    if (active) {
      const sync = active.multicamSync ?? 0;
      resolved.push({
        ...active,
        inPoint: Math.max(0, (active.inPoint ?? 0) + sync),
      });
    }
  }
  // Preserve original relative order by original index
  const order = new Map(clips.map((c, i) => [c.id, i]));
  return resolved.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function defaultText(id: string, start: number): TextOverlay {
  return {
    id,
    text: "Your text",
    start: Math.max(0, start),
    duration: 3,
    x: 0.5,
    y: 0.5,
    size: 0.08,
    color: "#ffffff",
    align: "center",
    bold: true,
    anim: "fade",
    font: "Arial Black",
    stroke: 3,
    strokeColor: "#000000",
    shadow: 1,
    shadowColor: "#000000",
    bg: false,
    bgColor: "#000000",
    bgOpacity: 0.6,
    opacity: 1,
    letterSpacing: 0,
    lineHeight: 1.1,
    transform: "none",
  };
}

/** True when a text overlay has visible content (plain, rich runs, or sticker). */
export function textHasContent(t: TextOverlay): boolean {
  if (t.stickerUrl) return true;
  if (t.runs?.some((r) => r.text.trim())) return true;
  return Boolean(t.text?.trim());
}

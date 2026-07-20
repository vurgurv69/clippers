/**
 * CapCut-style UI catalog — maps consumer-facing cards onto existing editor APIs.
 * No new render pipelines; only presentation + apply helpers.
 */

import type {
  ColorGrade,
  EffectKind,
  TextAnim,
  TextOverlay,
  TransitionKind,
} from "@/lib/editor-types";
import { COLOR_PRESETS, EFFECT_DEFS, TEXT_TEMPLATES, TRANSITION_DEFS } from "@/lib/editor-types";

export type LibraryCategory = { id: string; label: string };

/** Vertical rail tabs (one panel open at a time). */
export const LIBRARY_TABS = [
  { id: "media", label: "Media", icon: "▣" },
  { id: "ai", label: "AI", icon: "✦" },
  { id: "transcript", label: "Script", icon: "≡" },
  { id: "text", label: "Text", icon: "T" },
  { id: "audio", label: "Audio", icon: "♪" },
  { id: "transitions", label: "Trans", icon: "⇄" },
  { id: "effects", label: "Effects", icon: "✧" },
  { id: "stickers", label: "Stickers", icon: "◇" },
  { id: "templates", label: "Templates", icon: "▦" },
  { id: "filters", label: "Filters", icon: "◎" },
  { id: "animations", label: "Anim", icon: "↻" },
  { id: "broll", label: "B-roll", icon: "⧉" },
  { id: "cleanup", label: "Clean", icon: "✂" },
  { id: "motion", label: "CTA", icon: "▶" },
  { id: "publish", label: "Publish", icon: "⇪" },
] as const;

export type LibraryTabId = (typeof LIBRARY_TABS)[number]["id"];

/* ── Text ─────────────────────────────────────────────── */

export const TEXT_CATEGORIES: LibraryCategory[] = [
  { id: "basic", label: "Basic" },
  { id: "templates", label: "Templates" },
  { id: "titles", label: "Titles" },
  { id: "captions", label: "Captions" },
  { id: "lower", label: "Lower Thirds" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "gaming", label: "Gaming" },
  { id: "business", label: "Business" },
  { id: "modern", label: "Modern" },
  { id: "neon", label: "Neon" },
  { id: "minimal", label: "Minimal" },
  { id: "bold", label: "Bold" },
  { id: "elegant", label: "Elegant" },
  { id: "animated", label: "Animated" },
];

export type TextCard = {
  id: string;
  label: string;
  category: string;
  preview: string;
  style: Partial<TextOverlay>;
  accent: string;
};

function textCard(
  id: string,
  label: string,
  category: string,
  preview: string,
  style: Partial<TextOverlay>,
  accent: string,
): TextCard {
  return { id, label, category, preview, style, accent };
}

/** CapCut-style text cards — all map to TextOverlay patches. */
export const TEXT_CARDS: TextCard[] = [
  textCard("basic-plain", "Add text", "basic", "Aa", { size: 0.08, y: 0.5, color: "#fff", bold: true, anim: "fade" }, "#2dd4a8"),
  ...TEXT_TEMPLATES.map((t) =>
    textCard(
      `tpl-${t.id}`,
      t.label,
      t.id === "lower3"
        ? "lower"
        : t.id === "youtube"
          ? "youtube"
          : t.id === "caption"
            ? "captions"
            : t.id === "title" || t.id === "subtitle"
              ? "titles"
              : "templates",
      t.label.slice(0, 8),
      t.apply,
      "#2dd4a8",
    ),
  ),
  textCard("yt-subscribe", "Subscribe", "youtube", "SUB", { size: 0.1, y: 0.75, bold: true, color: "#fff", bg: true, bgColor: "#ff0000", bgOpacity: 0.95, anim: "slide", transform: "upper" }, "#ef4444"),
  textCard("tt-hook", "TikTok Hook", "tiktok", "WAIT", { size: 0.14, y: 0.35, bold: true, color: "#fff", stroke: 4, strokeColor: "#000", anim: "slide", font: "Impact", transform: "upper" }, "#22d3ee"),
  textCard("game-kill", "Kill Feed", "gaming", "GG", { size: 0.09, y: 0.2, bold: true, color: "#39ff14", stroke: 2, strokeColor: "#000", anim: "fade", font: "Arial Black" }, "#39ff14"),
  textCard("biz-name", "Name Tag", "business", "Name", { size: 0.05, x: 0.25, y: 0.8, align: "left", bold: true, color: "#fff", bg: true, bgColor: "#0f172a", bgOpacity: 0.85, anim: "slide" }, "#64748b"),
  textCard("modern-clean", "Clean", "modern", "Hello", { size: 0.09, y: 0.5, bold: false, color: "#f8fafc", font: "Arial", anim: "fade", letterSpacing: 2 }, "#94a3b8"),
  textCard("neon-glow", "Neon", "neon", "NEON", { size: 0.12, y: 0.5, bold: true, color: "#2dd4a8", stroke: 0, shadow: 12, shadowColor: "#2dd4a8", anim: "fade", transform: "upper" }, "#2dd4a8"),
  textCard("min-line", "Minimal", "minimal", "soft", { size: 0.055, y: 0.5, color: "#e2e8f0", font: "Georgia", anim: "fade" }, "#cbd5e1"),
  textCard("bold-impact", "Impact", "bold", "BOLD", { size: 0.16, y: 0.5, bold: true, color: "#fff", stroke: 5, strokeColor: "#000", anim: "slide", transform: "upper", font: "Impact" }, "#f59e0b"),
  textCard("elegant-serif", "Serif", "elegant", "Story", { size: 0.08, y: 0.5, color: "#fef3c7", font: "Georgia", italic: true, anim: "fade" }, "#d4a574"),
  textCard("anim-typing", "Typing", "animated", "…", { size: 0.07, y: 0.55, bold: true, color: "#fff", anim: "fade", bg: true, bgColor: "#111", bgOpacity: 0.6 }, "#a78bfa"),
  textCard("anim-pop", "Pop", "animated", "POP", { size: 0.11, y: 0.45, bold: true, color: "#fff", anim: "slide", stroke: 3, strokeColor: "#000" }, "#f472b6"),
  textCard("anim-bounce", "Bounce", "animated", "Hey!", { size: 0.1, y: 0.4, bold: true, color: "#fde68a", anim: "slide" }, "#fbbf24"),
  textCard("anim-slide", "Slide In", "animated", "→", { size: 0.09, y: 0.5, bold: true, color: "#fff", anim: "slide" }, "#38bdf8"),
  textCard("anim-fade", "Soft Fade", "animated", "Aa", { size: 0.08, y: 0.5, color: "#fff", anim: "fade" }, "#94a3b8"),
  textCard("anim-zoom", "Zoom Title", "animated", "ZOOM", { size: 0.13, y: 0.5, bold: true, color: "#fff", anim: "fade", transform: "upper" }, "#34d399"),
  /* Caption style library (maps to TextOverlay; karaoke burn is Export → Karaoke) */
  textCard("cap-tiktok", "TikTok Cap", "captions", "WAIT", {
    size: 0.09, y: 0.78, bold: true, color: "#fff", stroke: 4, strokeColor: "#000",
    font: "Impact", anim: "slide", transform: "upper",
  }, "#22d3ee"),
  textCard("cap-hormozi", "Hormozi", "captions", "THIS", {
    size: 0.1, y: 0.72, bold: true, color: "#ffe600", stroke: 5, strokeColor: "#000",
    font: "Arial Black", anim: "slide", transform: "upper",
  }, "#ffe600"),
  textCard("cap-minimal", "Minimal Cap", "captions", "soft", {
    size: 0.045, y: 0.86, color: "#f8fafc", font: "Georgia", anim: "fade", stroke: 0,
  }, "#94a3b8"),
  textCard("cap-podcast", "Podcast", "captions", "Said:", {
    size: 0.055, y: 0.82, bold: true, color: "#fff", bg: true, bgColor: "#111827",
    bgOpacity: 0.75, font: "Arial", anim: "fade",
  }, "#60a5fa"),
  textCard("cap-gaming", "Gaming Cap", "captions", "CLUTCH", {
    size: 0.08, y: 0.8, bold: true, color: "#39ff14", stroke: 3, strokeColor: "#000",
    font: "Arial Black", anim: "slide", transform: "upper",
  }, "#39ff14"),
  textCard("cap-luxury", "Luxury Cap", "captions", "Quiet", {
    size: 0.05, y: 0.84, color: "#fef3c7", font: "Georgia", italic: true, anim: "fade",
    letterSpacing: 3,
  }, "#d4a574"),
  textCard("cap-neon", "Neon Cap", "captions", "GLOW", {
    size: 0.085, y: 0.76, bold: true, color: "#2dd4a8", shadow: 14, shadowColor: "#2dd4a8",
    font: "Arial Black", anim: "fade", transform: "upper",
  }, "#2dd4a8"),
  textCard("cap-emoji", "Emoji Cap", "captions", "🔥 FIRE TIP", {
    size: 0.07, y: 0.78, bold: true, color: "#fff", stroke: 3, strokeColor: "#000",
    font: "Arial Black", anim: "slide",
  }, "#f97316"),
  textCard("cap-speaker-a", "Speaker A", "captions", "Host", {
    size: 0.055, y: 0.8, bold: true, color: "#38bdf8", stroke: 2, strokeColor: "#000",
    font: "Arial", anim: "fade",
    runs: [{ text: "Host: ", bold: true, color: "#38bdf8" }, { text: "Your line here", color: "#ffffff" }],
  }, "#38bdf8"),
  textCard("cap-speaker-b", "Speaker B", "captions", "Guest", {
    size: 0.055, y: 0.8, bold: true, color: "#f472b6", stroke: 2, strokeColor: "#000",
    font: "Arial", anim: "fade",
    runs: [{ text: "Guest: ", bold: true, color: "#f472b6" }, { text: "Your line here", color: "#ffffff" }],
  }, "#f472b6"),
  textCard("cap-highlight", "Highlight Word", "captions", "KEY WORD", {
    size: 0.08, y: 0.75, bold: true, color: "#ffe600", stroke: 4, strokeColor: "#000",
    font: "Impact", anim: "slide", transform: "upper",
    runs: [
      { text: "The ", color: "#ffffff", bold: true },
      { text: "KEY", color: "#ffe600", bold: true },
      { text: " moment", color: "#ffffff", bold: true },
    ],
  }, "#ffe600"),
];

/* ── Growth shells (B-roll / CTA) ───────────────────── */

export type ShellCard = {
  id: string;
  label: string;
  preview: string;
  hint: string;
  style: Partial<TextOverlay>;
};

export const BROLL_CARDS: ShellCard[] = [
  {
    id: "br-arrow",
    label: "Arrow callout",
    preview: "→",
    hint: "Point at detail",
    style: { text: "→ LOOK", size: 0.1, y: 0.35, bold: true, color: "#fff", stroke: 3, strokeColor: "#000", anim: "slide" },
  },
  {
    id: "br-emoji",
    label: "Reaction",
    preview: "😮",
    hint: "Emoji sticker",
    style: { text: "😮", size: 0.16, y: 0.28, anim: "slide" },
  },
  {
    id: "br-stat",
    label: "Stat pop",
    preview: "99%",
    hint: "Number overlay",
    style: { text: "99%", size: 0.14, y: 0.4, bold: true, color: "#12d6a0", stroke: 3, strokeColor: "#000", anim: "fade", font: "Impact" },
  },
  {
    id: "br-location",
    label: "Location",
    preview: "📍",
    hint: "Place tag",
    style: { text: "📍 Here", size: 0.06, y: 0.18, bold: true, color: "#fff", bg: true, bgColor: "#0f172a", bgOpacity: 0.8, anim: "slide" },
  },
  {
    id: "br-quote",
    label: "Quote card",
    preview: "“”",
    hint: "Pull quote",
    style: { text: "“The line that stuck”", size: 0.06, y: 0.5, color: "#fff", font: "Georgia", italic: true, anim: "fade" },
  },
  {
    id: "br-product",
    label: "Product tag",
    preview: "◆",
    hint: "Name drop",
    style: { text: "Featured", size: 0.05, x: 0.22, y: 0.78, align: "left", bold: true, color: "#fff", bg: true, bgColor: "#12d6a0", bgOpacity: 0.9, anim: "slide" },
  },
];

export const MOTION_CTA_CARDS: ShellCard[] = [
  {
    id: "cta-follow",
    label: "Follow CTA",
    preview: "+",
    hint: "End screen",
    style: { text: "FOLLOW FOR PART 2", size: 0.08, y: 0.72, bold: true, color: "#fff", stroke: 3, strokeColor: "#000", anim: "slide", transform: "upper" },
  },
  {
    id: "cta-comment",
    label: "Comment CTA",
    preview: "💬",
    hint: "Engagement ask",
    style: { text: "Comment YES if this helped", size: 0.06, y: 0.78, bold: true, color: "#fff", bg: true, bgColor: "#111", bgOpacity: 0.75, anim: "fade" },
  },
  {
    id: "cta-link",
    label: "Link CTA",
    preview: "🔗",
    hint: "Bio / link",
    style: { text: "LINK IN BIO 🔗", size: 0.07, y: 0.8, bold: true, color: "#12d6a0", stroke: 2, strokeColor: "#000", anim: "slide", transform: "upper" },
  },
  {
    id: "cta-save",
    label: "Save CTA",
    preview: "★",
    hint: "Save reminder",
    style: { text: "SAVE THIS ★", size: 0.08, y: 0.75, bold: true, color: "#fde68a", stroke: 3, strokeColor: "#000", anim: "slide", transform: "upper" },
  },
  {
    id: "cta-subscribe",
    label: "Subscribe anim",
    preview: "▶",
    hint: "YouTube end card",
    style: {
      text: "SUBSCRIBE ▶",
      size: 0.09,
      y: 0.7,
      bold: true,
      color: "#ff0000",
      stroke: 3,
      strokeColor: "#fff",
      anim: "slide",
      transform: "upper",
      bg: true,
      bgColor: "#ffffff",
      bgOpacity: 0.95,
    },
  },
  {
    id: "cta-progress",
    label: "Progress bar",
    preview: "══",
    hint: "Chapter progress label",
    style: {
      text: "▓▓▓▓▓▓░░░░ 60%",
      size: 0.045,
      y: 0.12,
      x: 0.5,
      bold: true,
      color: "#12d6a0",
      font: "Consolas",
      anim: "fade",
      bg: true,
      bgColor: "#0b1f1a",
      bgOpacity: 0.8,
    },
  },
  {
    id: "cta-social",
    label: "Social overlay",
    preview: "@",
    hint: "Handle watermark",
    style: {
      text: "@yourhandle",
      size: 0.04,
      x: 0.18,
      y: 0.92,
      align: "left",
      color: "#ffffff",
      opacity: 0.85,
      anim: "none",
      font: "Arial",
    },
  },
];

/* ── Transitions ─────────────────────────────────────── */

export const TRANSITION_CATEGORIES: LibraryCategory[] = [
  { id: "basic", label: "Basic" },
  { id: "camera", label: "Camera" },
  { id: "blur", label: "Blur" },
  { id: "light", label: "Light" },
  { id: "glitch", label: "Glitch" },
  { id: "3d", label: "3D" },
  { id: "zoom", label: "Zoom" },
  { id: "warp", label: "Warp" },
  { id: "spin", label: "Spin" },
  { id: "film", label: "Film" },
  { id: "retro", label: "Retro" },
  { id: "flash", label: "Flash" },
  { id: "slide", label: "Slide" },
  { id: "whip", label: "Whip" },
  { id: "creative", label: "Creative" },
  { id: "favorites", label: "Favorites" },
];

const TR_CAT: Partial<Record<TransitionKind, string>> = {
  none: "basic",
  crossfade: "basic",
  dissolve: "basic",
  fadeblack: "film",
  fadewhite: "light",
  flash: "flash",
  zoom: "zoom",
  slide: "slide",
  push: "slide",
  pull: "slide",
  whip: "whip",
  blur: "blur",
  spin: "spin",
  warp: "warp",
  liquid: "warp",
  morph: "creative",
  glitch: "glitch",
  shake: "camera",
  filmburn: "film",
  circlewipe: "creative",
  clockwipe: "retro",
  pageturn: "creative",
  cube: "3d",
  flip: "3d",
  stretch: "creative",
  wipeup: "slide",
  wipedown: "slide",
};

export type TransitionCard = {
  id: TransitionKind;
  label: string;
  category: string;
  swatch: string;
};

export const TRANSITION_CARDS: TransitionCard[] = TRANSITION_DEFS.map((t) => ({
  id: t.id,
  label: t.label,
  category: TR_CAT[t.id] || "creative",
  swatch: transitionSwatch(t.id),
}));

function transitionSwatch(id: TransitionKind): string {
  const map: Partial<Record<TransitionKind, string>> = {
    none: "linear-gradient(90deg,#334155,#334155)",
    crossfade: "linear-gradient(90deg,#1e293b,#94a3b8)",
    dissolve: "linear-gradient(90deg,#0f172a 40%,#64748b 60%)",
    fadeblack: "linear-gradient(90deg,#64748b,#000)",
    fadewhite: "linear-gradient(90deg,#64748b,#fff)",
    flash: "linear-gradient(90deg,#0f172a,#fff,#0f172a)",
    zoom: "radial-gradient(circle,#2dd4a8,#0f172a)",
    slide: "linear-gradient(90deg,#0f172a,#2dd4a8)",
    push: "linear-gradient(90deg,#1e293b,#38bdf8)",
    whip: "linear-gradient(105deg,#0f172a 30%,#f472b6 50%,#0f172a 70%)",
    blur: "linear-gradient(90deg,#475569,#94a3b8)",
    spin: "conic-gradient(from 90deg,#2dd4a8,#0f172a,#2dd4a8)",
    warp: "linear-gradient(135deg,#a78bfa,#2dd4a8)",
    glitch: "linear-gradient(90deg,#ef4444,#22d3ee,#ef4444)",
    shake: "linear-gradient(90deg,#f59e0b,#0f172a,#f59e0b)",
    filmburn: "linear-gradient(90deg,#78350f,#fbbf24,#78350f)",
    cube: "linear-gradient(135deg,#312e81,#818cf8)",
    flip: "linear-gradient(180deg,#0f172a,#2dd4a8,#0f172a)",
  };
  return map[id] || "linear-gradient(135deg,#1e293b,#2dd4a8)";
}

/* ── Effects ─────────────────────────────────────────── */

export const EFFECT_CATEGORIES: LibraryCategory[] = [
  { id: "all", label: "All" },
  { id: "glow", label: "Glow" },
  { id: "motion", label: "Motion" },
  { id: "color", label: "Color" },
  { id: "distort", label: "Distort" },
  { id: "film", label: "Film" },
];

const FX_CAT: Partial<Record<EffectKind, string>> = {
  glow: "glow",
  bloom: "glow",
  shadow: "glow",
  blur: "motion",
  motionblur: "motion",
  shake: "motion",
  rgbsplit: "color",
  hue: "color",
  tint: "color",
  negate: "color",
  posterize: "color",
  wave: "distort",
  pixelate: "distort",
  mirror: "distort",
  emboss: "distort",
  grain: "film",
  vignette: "film",
  sharpen: "film",
};

export type EffectCard = {
  kind: EffectKind;
  label: string;
  category: string;
  hint: string;
  swatch: string;
};

export const EFFECT_CARDS: EffectCard[] = EFFECT_DEFS.map((e) => ({
  kind: e.kind,
  label: e.label,
  category: FX_CAT[e.kind] || "all",
  hint: e.hint,
  swatch: effectSwatch(e.kind),
}));

function effectSwatch(kind: EffectKind): string {
  const map: Partial<Record<EffectKind, string>> = {
    glow: "radial-gradient(circle,#2dd4a8aa,#0f172a)",
    bloom: "radial-gradient(circle,#fef08a88,#0f172a)",
    blur: "linear-gradient(90deg,#64748b88,#94a3b844)",
    motionblur: "linear-gradient(105deg,#0f172a,#94a3b8,#0f172a)",
    shake: "linear-gradient(90deg,#f59e0b,#0f172a)",
    rgbsplit: "linear-gradient(90deg,#ef4444,#22d3ee)",
    grain: "repeating-linear-gradient(0deg,#1e293b,#334155 2px)",
    vignette: "radial-gradient(circle,#334155,#000)",
    pixelate: "repeating-conic-gradient(#334155 0% 25%,#1e293b 0% 50%) 0 0/16px 16px",
    shadow: "linear-gradient(135deg,#0f172a,#475569)",
  };
  return map[kind] || "linear-gradient(135deg,#1e293b,#2dd4a8)";
}

/* ── Filters (color presets) ─────────────────────────── */

export const FILTER_CATEGORIES: LibraryCategory[] = [
  { id: "cinematic", label: "Cinematic" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "vintage", label: "Vintage" },
  { id: "film", label: "Film" },
  { id: "night", label: "Night" },
  { id: "portrait", label: "Portrait" },
  { id: "nature", label: "Nature" },
  { id: "travel", label: "Travel" },
  { id: "food", label: "Food" },
  { id: "bw", label: "Black & White" },
];

export type FilterCard = {
  id: string;
  label: string;
  category: string;
  grade: Omit<ColorGrade, "preset">;
  preview: string;
};

/** Extra consumer filters on top of COLOR_PRESETS. */
export const FILTER_CARDS: FilterCard[] = [
  ...COLOR_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    category:
      p.id === "cinema"
        ? "cinematic"
        : p.id === "warm"
          ? "warm"
          : p.id === "mono"
            ? "bw"
            : p.id === "faded"
              ? "vintage"
              : p.id === "vivid" || p.id === "punch"
                ? "travel"
                : "cinematic",
    grade: p.grade,
    preview: filterPreview(p.id),
  })),
  {
    id: "cool-blue",
    label: "Cool Blue",
    category: "cool",
    grade: { brightness: 1.02, contrast: 1.1, saturation: 1.05, sharpen: 0.2, vignette: 0.15, temperature: -35 },
    preview: "linear-gradient(135deg,#0ea5e9,#1e3a5f)",
  },
  {
    id: "night-city",
    label: "Night City",
    category: "night",
    grade: { brightness: 0.92, contrast: 1.25, saturation: 1.15, sharpen: 0.3, vignette: 0.45, temperature: -20, shadows: 20 },
    preview: "linear-gradient(135deg,#020617,#7c3aed)",
  },
  {
    id: "portrait-soft",
    label: "Soft Portrait",
    category: "portrait",
    grade: { brightness: 1.08, contrast: 0.95, saturation: 1.1, sharpen: 0.1, vignette: 0.2, temperature: 15 },
    preview: "linear-gradient(135deg,#fda4af,#fb7185)",
  },
  {
    id: "nature-green",
    label: "Nature",
    category: "nature",
    grade: { brightness: 1.05, contrast: 1.1, saturation: 1.35, sharpen: 0.25, vignette: 0.1, tint: -10 },
    preview: "linear-gradient(135deg,#166534,#4ade80)",
  },
  {
    id: "food-pop",
    label: "Food Pop",
    category: "food",
    grade: { brightness: 1.06, contrast: 1.2, saturation: 1.45, sharpen: 0.45, vignette: 0.1, temperature: 20 },
    preview: "linear-gradient(135deg,#ea580c,#fbbf24)",
  },
  {
    id: "film-stock",
    label: "Film Stock",
    category: "film",
    grade: { brightness: 1.0, contrast: 1.15, saturation: 0.95, sharpen: 0.15, vignette: 0.35, temperature: 10 },
    preview: "linear-gradient(135deg,#44403c,#a8a29e)",
  },
];

function filterPreview(id: string): string {
  const map: Record<string, string> = {
    none: "linear-gradient(135deg,#334155,#64748b)",
    vivid: "linear-gradient(135deg,#f43f5e,#3b82f6)",
    punch: "linear-gradient(135deg,#f59e0b,#ef4444)",
    warm: "linear-gradient(135deg,#f97316,#fde68a)",
    cinema: "linear-gradient(135deg,#0f172a,#334155)",
    mono: "linear-gradient(135deg,#111,#999)",
    faded: "linear-gradient(135deg,#94a3b8,#e2e8f0)",
  };
  return map[id] || "linear-gradient(135deg,#1e293b,#2dd4a8)";
}

/* ── Animations ──────────────────────────────────────── */

export const ANIM_CATEGORIES: LibraryCategory[] = [
  { id: "in", label: "In" },
  { id: "out", label: "Out" },
  { id: "combo", label: "Combo" },
];

export const ANIM_STYLE_CATEGORIES: LibraryCategory[] = [
  { id: "fade", label: "Fade" },
  { id: "pop", label: "Pop" },
  { id: "bounce", label: "Bounce" },
  { id: "slide", label: "Slide" },
  { id: "scale", label: "Scale" },
  { id: "rotate", label: "Rotate" },
  { id: "glitch", label: "Glitch" },
  { id: "camera", label: "Camera" },
  { id: "elastic", label: "Elastic" },
  { id: "smooth", label: "Smooth" },
  { id: "cinematic", label: "Cinematic" },
];

export type AnimCard = {
  id: string;
  label: string;
  phase: "in" | "out" | "combo";
  style: string;
  /** Maps to TextAnim or clip transform hint */
  textAnim: TextAnim;
  preview: string;
};

export const ANIM_CARDS: AnimCard[] = [
  { id: "fade-in", label: "Fade In", phase: "in", style: "fade", textAnim: "fade", preview: "fade" },
  { id: "fade-out", label: "Fade Out", phase: "out", style: "fade", textAnim: "fade", preview: "fade" },
  { id: "slide-in", label: "Slide In", phase: "in", style: "slide", textAnim: "slide", preview: "slide" },
  { id: "slide-out", label: "Slide Out", phase: "out", style: "slide", textAnim: "slide", preview: "slide" },
  { id: "pop-in", label: "Pop", phase: "in", style: "pop", textAnim: "pop", preview: "pop" },
  { id: "bounce-in", label: "Bounce", phase: "in", style: "bounce", textAnim: "pop", preview: "bounce" },
  { id: "scale-in", label: "Scale Up", phase: "in", style: "scale", textAnim: "zoom", preview: "scale" },
  { id: "rotate-in", label: "Rotate", phase: "combo", style: "rotate", textAnim: "zoom", preview: "rotate" },
  { id: "glitch-in", label: "Glitch", phase: "in", style: "glitch", textAnim: "slide", preview: "glitch" },
  { id: "camera-pan", label: "Camera Pan", phase: "combo", style: "camera", textAnim: "none", preview: "camera" },
  { id: "elastic", label: "Elastic", phase: "in", style: "elastic", textAnim: "pop", preview: "elastic" },
  { id: "smooth", label: "Smooth", phase: "combo", style: "smooth", textAnim: "fade", preview: "smooth" },
  { id: "cinematic", label: "Cinematic", phase: "combo", style: "cinematic", textAnim: "zoom", preview: "cine" },
];

/* ── Project templates (suggested empty-state) ─────── */

export const PROJECT_TEMPLATES = [
  { id: "reel", label: "Vertical Reel", hint: "9:16 · social", aspect: "9:16" as const },
  { id: "yt", label: "YouTube", hint: "16:9 · landscape", aspect: "16:9" as const },
  { id: "square", label: "Square Post", hint: "1:1 · feed", aspect: "1:1" as const },
  { id: "story", label: "Story", hint: "9:16 · 15s vibe", aspect: "9:16" as const },
];

/**
 * Growth Hub + AI clipping types (Phase 1).
 * All fields are additive / optional for backwards compatibility.
 */

export type AiMarkerKind =
  | "hook"
  | "funny"
  | "emotional"
  | "energy"
  | "silence"
  | "pause"
  | "viral"
  | "question"
  | "story"
  | "cta"
  | "tip"
  | "surprise";

export type AiSuggestion = {
  id: string;
  kind: AiMarkerKind;
  /** Timeline start (seconds) */
  start: number;
  /** Timeline end (seconds) */
  end: number;
  label: string;
  emoji: string;
  reason: string;
  score: number;
};

export type HookFixId =
  | "zoom"
  | "captions"
  | "punch"
  | "music"
  | "transition";

export type GrowthTitles = {
  youtube: string[];
  tiktok: string[];
  instagram: string[];
  shorts: string[];
  linkedin?: string[];
  x?: string[];
};

export type AbThumbnail = {
  id: string;
  ideaId: string;
  headline: string;
  url: string;
  winner?: boolean;
};

export type ViralScorecard = {
  overall: number;
  virality: number;
  engagement: number;
  pacing: number;
  hook: number;
  subtitles: number;
  visual: number;
  retention: number;
  reasons: string[];
  bestPlatforms: string[];
  estimatedRetentionPct: number;
  suggestedPostTime: string;
  hookWeak: boolean;
  hookFixes: HookFixId[];
  /** Predicted retention curve: pct remaining at timeline fraction 0..1 */
  retentionCurve?: { t: number; pct: number }[];
  /** Actionable improvement chips beyond hook fixes */
  improvements?: string[];
  /** Estimated CTR lift from thumb+title heuristics (0..1 style %) */
  estimatedCtrPct?: number;
};

export type GrowthPack = {
  score: ViralScorecard;
  titles: GrowthTitles;
  description: string;
  cta: string;
  hashtags: Record<string, string[]>;
  chapters: string[];
  thumbnailIdeas: { id: string; label: string; headline: string; vibe: string }[];
  /** Phase 5 — generated A/B thumbnail PNGs */
  abThumbs?: AbThumbnail[];
  /** SEO keywords for descriptions */
  seoKeywords?: string[];
  createdAt: string;
};

export type BrandKit = {
  primary: string;
  secondary: string;
  accent: string;
  fontHeading: string;
  fontBody: string;
  logoUrl?: string;
  watermark?: string;
};

export type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  platform?: string;
  status: "draft" | "scheduled" | "posted";
  clipRef?: string;
};

export type AnalyzeResponse = {
  suggestions: AiSuggestion[];
  score: ViralScorecard;
  usedLlm: boolean;
};

export type SuggestResponse = {
  pack: GrowthPack;
  usedLlm: boolean;
};

export const AI_MARKER_META: Record<
  AiMarkerKind,
  { emoji: string; label: string; color: string }
> = {
  hook: { emoji: "🔥", label: "Viral Hook", color: "#f97316" },
  funny: { emoji: "😂", label: "Funny", color: "#eab308" },
  emotional: { emoji: "💔", label: "Emotional", color: "#ec4899" },
  energy: { emoji: "📈", label: "High Energy", color: "#22c55e" },
  silence: { emoji: "🤫", label: "Silence", color: "#64748b" },
  pause: { emoji: "⏸", label: "Pause", color: "#94a3b8" },
  viral: { emoji: "🚀", label: "High Retention", color: "#12d6a0" },
  question: { emoji: "❓", label: "Question", color: "#3b82f6" },
  story: { emoji: "📖", label: "Story Arc", color: "#8b5cf6" },
  cta: { emoji: "👉", label: "Call to Action", color: "#ef4444" },
  tip: { emoji: "💡", label: "Tip", color: "#06b6d4" },
  surprise: { emoji: "😲", label: "Surprise", color: "#f59e0b" },
};

export const HOOK_FIX_LABELS: Record<HookFixId, string> = {
  zoom: "Add punch-in zoom",
  captions: "Drop bold captions",
  punch: "Punch-in scale",
  music: "Add music bed + duck",
  transition: "Add flash transition",
};

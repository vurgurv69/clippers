export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "rendering"
  | "paused"
  | "done"
  | "error"
  | "cancelled";

export type AspectRatio = "9:16" | "1:1" | "4:5" | "16:9";
export type LayoutMode = "auto" | "fill" | "face-top";

/** Force TikTok / Instagram no-watermark HD download path. */
export type DownloadHint =
  | "auto"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "facebook"
  | "x"
  | "twitch"
  | "kick"
  | "vimeo";

export type WhisperQuality = "fast" | "balanced" | "best";
export type CaptionReadMode = "verbatim" | "readable" | "minimal";
export type CaptionThemeId =
  | "tiktok-clean"
  | "tiktok-bold"
  | "hormozi"
  | "podcast"
  | "gaming"
  | "minimal"
  | "cinematic"
  | "luxury"
  | "neon"
  | "youtube-shorts"
  | "instagram-reels";

export type ExportQuality = "high" | "very-high" | "maximum";
export type ExportCodec = "h264" | "hevc" | "av1" | "vp9";

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
  /** Optional diarization label (0 = speaker A, …). */
  speakerId?: number;
};

export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
};

export type ClipPlan = {
  id: string;
  title: string;
  hook: string;
  start: number;
  end: number;
  viralityScore: number;
  reason: string;
  /** Additive quality metrics (optional for old jobs). */
  retentionScore?: number;
  hookScore?: number;
  confidenceScore?: number;
  captionQuality?: number;
  description?: string;
  hashtags?: string[];
  pinnedComment?: string;
  cta?: string;
};

export type RenderedClip = ClipPlan & {
  filename: string;
  duration: number;
  previewUrl: string;
  downloadUrl: string;
  layoutUsed?: "fill" | "face-top";
  analytics?: {
    viralityScore: number;
    retentionScore: number;
    hookScore: number;
    captionQuality: number;
    editingQuality: number;
    seoScore: number;
    recommendations: string[];
  };
  thumbnailUrl?: string;
};

export type Job = {
  id: string;
  url: string;
  status: JobStatus;
  progress: number;
  message: string;
  title?: string;
  duration?: number;
  aspectRatio: AspectRatio;
  layoutMode: LayoutMode;
  /** Burn on-screen captions (default true). */
  captionsEnabled: boolean;
  /** Prefer platform-specific HD helpers. */
  downloadHint?: DownloadHint;
  whisperQuality?: WhisperQuality;
  captionTheme?: CaptionThemeId;
  captionReadMode?: CaptionReadMode;
  captionEmojis?: boolean;
  exportQuality?: ExportQuality;
  exportCodec?: ExportCodec;
  preferHwEncode?: boolean;
  /** UX timing */
  stageStartedAt?: string;
  elapsedMs?: number;
  etaMs?: number;
  currentTask?: string;
  cpuPercent?: number;
  memoryMb?: number;
  speakerCount?: number;
  chapters?: string[];
  analyticsSummary?: {
    seoScore: number;
    editingQuality: number;
    platformFit: { tiktok: number; reels: number; shorts: number };
    recommendations: string[];
  };
  /** Soft pause between pipeline stages */
  pauseRequested?: boolean;
  clips: RenderedClip[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export const ASPECT_PRESETS: Record<
  AspectRatio,
  { w: number; h: number; label: string; hint: string }
> = {
  "9:16": { w: 1080, h: 1920, label: "9:16", hint: "TikTok / Reels / Shorts" },
  "1:1": { w: 1080, h: 1080, label: "1:1", hint: "Instagram feed" },
  "4:5": { w: 1080, h: 1350, label: "4:5", hint: "IG portrait" },
  "16:9": { w: 1920, h: 1080, label: "16:9", hint: "YouTube" },
};

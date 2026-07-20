export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "rendering"
  | "done"
  | "error";

export type AspectRatio = "9:16" | "1:1" | "4:5" | "16:9";
export type LayoutMode = "auto" | "fill" | "face-top";

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
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
};

export type RenderedClip = ClipPlan & {
  filename: string;
  duration: number;
  previewUrl: string;
  downloadUrl: string;
  layoutUsed?: "fill" | "face-top";
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

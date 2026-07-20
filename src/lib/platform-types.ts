/**
 * Phase 3 platform types — OAuth, analytics, dub, marketplace, cloud sync.
 */

export type PublishPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "linkedin"
  | "x";

export type OAuthConnection = {
  platform: PublishPlatform;
  connected: boolean;
  accountName?: string;
  accountId?: string;
  connectedAt?: string;
  /** True when refresh/access tokens are stored server-side. */
  hasTokens?: boolean;
};

export type PublishJob = {
  id: string;
  platform: PublishPlatform;
  projectId: string;
  status: "queued" | "uploading" | "done" | "error";
  title: string;
  remoteId?: string;
  remoteUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsEvent = {
  id: string;
  platform: PublishPlatform | string;
  projectId?: string;
  postId?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTimeSec?: number;
  retentionPct?: number;
  recordedAt: string;
  source: "ingest" | "oauth" | "manual";
};

export type AnalyticsSummary = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** Average engagement-estimated retention across recent events (0–100). */
  avgRetentionPct?: number;
  byPlatform: Record<string, { views: number; likes: number; comments: number; shares: number }>;
  recent: AnalyticsEvent[];
};

export type TranslateLang = "en" | "ar" | "es" | "fr" | "de" | "pt" | "hi" | "ja" | "ko";

export type DubResult = {
  lang: TranslateLang;
  segments: { start: number; end: number; text: string }[];
  usedLlm: boolean;
  audioUrl?: string;
};

export type MarketplacePack = {
  id: string;
  label: string;
  owner?: string;
  textPresets: { id: string; label: string; style: Record<string, unknown> }[];
  colorPresets?: { id: string; label: string; grade: Record<string, unknown> }[];
  brandKit?: Record<string, unknown>;
  updatedAt: string;
  syncedAt?: string;
};

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type TeamRole = "admin" | "editor" | "reviewer";

export type ApprovalItem = {
  id: string;
  projectId: string;
  commentId?: string;
  title: string;
  note: string;
  author: string;
  /** Role of the requester (Phase 6). */
  authorRole?: TeamRole;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByRole?: TeamRole;
};

/** Dub track pieces returned by full-timeline TTS. */
export type DubTrackPiece = {
  asset: {
    id: string;
    kind: "audio";
    name: string;
    filename: string;
    duration: number;
    hasAudio: boolean;
    tags?: string[];
  };
  start: number;
  duration: number;
  text: string;
};

export type CloudSyncMeta = {
  projectId: string;
  revision: number;
  syncedAt: string;
  deviceId?: string;
};

/** Archived cloud snapshot entry (Phase 14). */
export type CloudVersionEntry = {
  revision: number;
  syncedAt: string;
  deviceId?: string;
  name?: string;
};

import fs from "fs/promises";
import path from "path";
import { parseCaptionsEnabled } from "./captions-flag";
import {
  clampFontSize,
  clampOutline,
  type CaptionAlign,
  type CaptionFontFamily,
} from "./caption-style";
import { clampClipCount } from "./parse-time";
import { assertSafeResourceId, PathSafetyError, resolveUnderRoot, assertSafeClipId, resolveDataFile } from "./safe-id";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ClipMode,
  DownloadHint,
  ExportCodec,
  ExportQuality,
  Job,
  JobStatus,
  LayoutMode,
  WhisperQuality,
} from "./types";

const DATA_ROOT = path.join(process.cwd(), ".data");
const JOBS_ROOT = path.join(DATA_ROOT, "jobs");

export function jobDir(jobId: string) {
  const id = assertSafeResourceId(jobId, "jobId");
  return resolveUnderRoot(JOBS_ROOT, id);
}

/** Safe path to a clip media file under `.data/jobs/<id>/clips/`. */
export function jobClipPath(jobId: string, clipId: string, ext: "mp4" | "jpg" | "ass" | "wav") {
  const id = assertSafeClipId(clipId);
  return resolveDataFile(jobDir(jobId), "clips", `${id}.${ext}`);
}

export function jobJsonPath(jobId: string) {
  return path.join(jobDir(jobId), "job.json");
}

export async function ensureDataDirs() {
  await fs.mkdir(path.join(DATA_ROOT, "jobs"), { recursive: true });
}

export async function createJob(
  url: string,
  opts: {
    aspectRatio?: AspectRatio;
    layoutMode?: LayoutMode;
    captionsEnabled?: boolean;
    downloadHint?: DownloadHint;
    whisperQuality?: WhisperQuality;
    captionTheme?: CaptionThemeId;
    captionReadMode?: CaptionReadMode;
    captionEmojis?: boolean;
    exportQuality?: ExportQuality;
    exportCodec?: ExportCodec;
    preferHwEncode?: boolean;
    clipCount?: number;
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
  } = {},
): Promise<Job> {
  await ensureDataDirs();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job: Job = {
    id,
    url,
    status: "queued",
    progress: 0,
    message: "Queued — getting ready to pull your video",
    aspectRatio: opts.aspectRatio || "9:16",
    layoutMode: opts.layoutMode || "auto",
    captionsEnabled: parseCaptionsEnabled(opts.captionsEnabled, true),
    downloadHint: opts.downloadHint || "auto",
    whisperQuality: opts.whisperQuality || "fast",
    captionTheme: opts.captionTheme || "tiktok-bold",
    captionReadMode: opts.captionReadMode || "readable",
    captionEmojis: opts.captionEmojis !== false,
    exportQuality: opts.exportQuality || "very-high",
    exportCodec: opts.exportCodec || "h264",
    preferHwEncode: opts.preferHwEncode !== false,
    clipCount: clampClipCount(opts.clipCount, 4),
    manualStartTime: opts.manualStartTime,
    manualEndTime: opts.manualEndTime,
    captionPrimary: opts.captionPrimary,
    captionHighlight: opts.captionHighlight,
    captionFont: opts.captionFont || "Montserrat",
    captionAlign: opts.captionAlign || "bottom",
    captionFontSize: clampFontSize(opts.captionFontSize, 72),
    captionOutline: clampOutline(opts.captionOutline, 6),
    captionBox: Boolean(opts.captionBox),
    removeWatermark: opts.removeWatermark !== false,
    clipMode: opts.clipMode === "social" ? "social" : "viral",
    stripBurnIn: Boolean(opts.stripBurnIn),
    stageStartedAt: now,
    currentTask: "queued",
    clips: [],
    createdAt: now,
    updatedAt: now,
  };
  await fs.mkdir(jobDir(id), { recursive: true });
  await saveJob(job);
  return job;
}

export async function saveJob(job: Job) {
  job.updatedAt = new Date().toISOString();
  await fs.writeFile(jobJsonPath(job.id), JSON.stringify(job, null, 2), "utf8");
}

export async function getJob(id: string): Promise<Job | null> {
  try {
    const raw = await fs.readFile(jobJsonPath(id), "utf8");
    const job = JSON.parse(raw) as Job;
    job.aspectRatio = job.aspectRatio || "9:16";
    job.layoutMode = job.layoutMode || "auto";
    job.captionsEnabled = parseCaptionsEnabled(job.captionsEnabled, true);
    job.whisperQuality = job.whisperQuality || "fast";
    job.captionTheme = job.captionTheme || "tiktok-bold";
    job.captionReadMode = job.captionReadMode || "readable";
    job.exportQuality = job.exportQuality || "very-high";
    job.exportCodec = job.exportCodec || "h264";
    if (job.preferHwEncode == null) job.preferHwEncode = true;
    job.clipCount = clampClipCount(job.clipCount, 4);
    job.captionFont = job.captionFont || "Montserrat";
    job.captionAlign = job.captionAlign || "bottom";
    if (job.captionFontSize == null) job.captionFontSize = 72;
    if (job.captionOutline == null) job.captionOutline = 6;
    if (job.removeWatermark == null) job.removeWatermark = true;
    job.clipMode = job.clipMode === "social" ? "social" : "viral";
    return job;
  } catch {
    return null;
  }
}

/** Recent jobs for history UI (newest first). */
export async function listJobs(limit = 24): Promise<Job[]> {
  await ensureDataDirs();
  const root = path.join(DATA_ROOT, "jobs");
  let ids: string[] = [];
  try {
    ids = await fs.readdir(root);
  } catch {
    return [];
  }
  const jobs: Job[] = [];
  for (const id of ids) {
    const job = await getJob(id);
    if (job) jobs.push(job);
  }
  jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return jobs.slice(0, Math.max(1, limit));
}

export async function updateJob(
  id: string,
  patch: Partial<Job> & { status?: JobStatus },
): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  const next = { ...job, ...patch };
  if (patch.status && patch.status !== job.status) {
    next.stageStartedAt = new Date().toISOString();
  }
  const started = new Date(next.createdAt).getTime();
  next.elapsedMs = Math.max(0, Date.now() - started);
  // Rough ETA from progress
  if (next.progress > 5 && next.progress < 100) {
    const rate = next.elapsedMs / next.progress;
    next.etaMs = Math.round(rate * (100 - next.progress));
  } else if (next.progress >= 100) {
    next.etaMs = 0;
  }
  if (patch.message) next.currentTask = patch.message;
  await saveJob(next);
  return next;
}

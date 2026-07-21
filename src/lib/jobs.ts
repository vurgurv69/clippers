import fs from "fs/promises";
import path from "path";
import { parseCaptionsEnabled } from "./captions-flag";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  DownloadHint,
  ExportCodec,
  ExportQuality,
  Job,
  JobStatus,
  LayoutMode,
  WhisperQuality,
} from "./types";

const DATA_ROOT = path.join(process.cwd(), ".data");

export function jobDir(jobId: string) {
  return path.join(DATA_ROOT, "jobs", jobId);
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

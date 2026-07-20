import fs from "fs/promises";
import path from "path";
import { parseCaptionsEnabled } from "./captions-flag";
import type { AspectRatio, Job, JobStatus, LayoutMode } from "./types";

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
    // Back-compat for older jobs
    job.aspectRatio = job.aspectRatio || "9:16";
    job.layoutMode = job.layoutMode || "auto";
    job.captionsEnabled = parseCaptionsEnabled(job.captionsEnabled, true);
    return job;
  } catch {
    return null;
  }
}

export async function updateJob(
  id: string,
  patch: Partial<Job> & { status?: JobStatus },
): Promise<Job> {
  const job = await getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  const next = { ...job, ...patch };
  await saveJob(next);
  return next;
}

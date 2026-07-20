import fs from "fs/promises";
import path from "path";
import type { ExportOptions, ProjectSpec } from "./editor-types";

export type ExportJobStatus = "queued" | "running" | "done" | "error" | "cancelled";

export type ExportJob = {
  id: string;
  projectId: string;
  status: ExportJobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  previewUrl?: string;
  downloadUrl?: string;
  outName?: string;
  format?: string;
};

type InternalJob = ExportJob & {
  spec: ProjectSpec;
  exportOptions?: Partial<ExportOptions>;
  controller: AbortController;
};

type PersistedRecord = ExportJob & {
  spec?: ProjectSpec;
  exportOptions?: Partial<ExportOptions>;
};

const jobs = new Map<string, InternalJob>();
const queue: string[] = [];
let pumping = false;
let hydratePromise: Promise<void> | null = null;

const HISTORY_PATH = path.join(process.cwd(), ".data", "export-jobs.json");

/** Render callback injected by the API route to avoid circular imports. */
let renderFn:
  | ((opts: {
      projectId: string;
      spec: ProjectSpec;
      exportOptions?: Partial<ExportOptions>;
      signal?: AbortSignal;
    }) => Promise<{ outName: string }>)
  | null = null;

export function setExportRenderer(
  fn: (opts: {
    projectId: string;
    spec: ProjectSpec;
    exportOptions?: Partial<ExportOptions>;
    signal?: AbortSignal;
  }) => Promise<{ outName: string }>,
) {
  renderFn = fn;
  void ensureHydrated();
}

/** Await disk hydrate (safe to call repeatedly). */
export function ensureHydrated(): Promise<void> {
  if (!hydratePromise) hydratePromise = loadHistory();
  return hydratePromise;
}

function publicJob(j: InternalJob): ExportJob {
  const { spec: _s, exportOptions: _e, controller: _c, ...rest } = j;
  return rest;
}

async function persistJobs() {
  try {
    await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
    const records: PersistedRecord[] = Array.from(jobs.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 60)
      .map((j) => {
        const base: PersistedRecord = { ...publicJob(j) };
        // Keep full payload only for resumable queued jobs.
        if (j.status === "queued") {
          base.spec = j.spec;
          base.exportOptions = j.exportOptions;
        }
        return base;
      });
    await fs.writeFile(HISTORY_PATH, JSON.stringify(records, null, 2), "utf8");
  } catch {
    // ignore disk errors — queue still works in-memory
  }
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const records = JSON.parse(raw) as PersistedRecord[];
    if (!Array.isArray(records)) return;
    for (const r of records) {
      if (jobs.has(r.id)) continue;
      if (r.status === "queued" && r.spec) {
        const job: InternalJob = {
          ...r,
          status: "queued",
          spec: r.spec,
          exportOptions: r.exportOptions,
          controller: new AbortController(),
        };
        jobs.set(job.id, job);
        queue.push(job.id);
      } else if (r.status === "running") {
        // Interrupted by process restart
        jobs.set(r.id, {
          ...r,
          status: "error",
          error: r.error || "Interrupted — server restarted",
          updatedAt: Date.now(),
          spec: r.spec || { aspect: "9:16", clips: [] },
          exportOptions: r.exportOptions,
          controller: new AbortController(),
        });
      } else {
        jobs.set(r.id, {
          ...r,
          spec: r.spec || { aspect: "9:16", clips: [] },
          exportOptions: r.exportOptions,
          controller: new AbortController(),
        });
      }
    }
    if (queue.length) void pumpQueue();
  } catch {
    // no history yet
  }
}

export function listExportJobs(projectId?: string): ExportJob[] {
  const all = Array.from(jobs.values()).map(publicJob);
  const filtered = projectId ? all.filter((j) => j.projectId === projectId) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, 40);
}

export function getExportJob(jobId: string): ExportJob | null {
  const j = jobs.get(jobId);
  return j ? publicJob(j) : null;
}

export function enqueueExportJob(opts: {
  projectId: string;
  spec: ProjectSpec;
  exportOptions?: Partial<ExportOptions>;
}): ExportJob {
  const id = crypto.randomUUID();
  const now = Date.now();
  const job: InternalJob = {
    id,
    projectId: opts.projectId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    format: opts.exportOptions?.format || "mp4",
    spec: opts.spec,
    exportOptions: opts.exportOptions,
    controller: new AbortController(),
  };
  jobs.set(id, job);
  queue.push(id);
  void persistJobs();
  void pumpQueue();
  return publicJob(job);
}

export function cancelExportJob(jobIdOrProjectId: string): boolean {
  let job = jobs.get(jobIdOrProjectId);
  if (!job) {
    job = Array.from(jobs.values())
      .filter(
        (j) =>
          j.projectId === jobIdOrProjectId &&
          (j.status === "queued" || j.status === "running"),
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }
  if (!job) return false;
  if (job.status === "queued") {
    job.status = "cancelled";
    job.updatedAt = Date.now();
    const qi = queue.indexOf(job.id);
    if (qi >= 0) queue.splice(qi, 1);
    void persistJobs();
    return true;
  }
  if (job.status === "running") {
    job.controller.abort();
    job.status = "cancelled";
    job.updatedAt = Date.now();
    void persistJobs();
    return true;
  }
  return false;
}

/** @deprecated — use cancelExportJob(jobId). Kept for older clients. */
export function beginExportJob(projectId: string): AbortSignal {
  const c = new AbortController();
  cancelExportJob(projectId);
  return c.signal;
}

export function endExportJob(_projectId: string, _signal: AbortSignal) {
  // no-op for legacy callers
}

async function pumpQueue() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      const job = jobs.get(id);
      if (!job || job.status !== "queued") continue;
      if (!renderFn) {
        job.status = "error";
        job.error = "Export renderer not registered";
        job.updatedAt = Date.now();
        void persistJobs();
        continue;
      }
      job.status = "running";
      job.updatedAt = Date.now();
      void persistJobs();
      try {
        const { outName } = await renderFn({
          projectId: job.projectId,
          spec: job.spec,
          exportOptions: job.exportOptions,
          signal: job.controller.signal,
        });
        if (job.controller.signal.aborted) {
          job.status = "cancelled";
        } else {
          job.status = "done";
          job.outName = outName;
          job.previewUrl = `/api/editor/project/${job.projectId}/file/${outName}?t=${Date.now()}`;
          job.downloadUrl = `/api/editor/project/${job.projectId}/file/${outName}?download=1`;
        }
      } catch (err) {
        if (job.controller.signal.aborted || (err instanceof Error && err.message === "Cancelled")) {
          job.status = "cancelled";
        } else {
          job.status = "error";
          job.error = err instanceof Error ? err.message : "Export failed";
        }
      }
      job.updatedAt = Date.now();
      void persistJobs();
    }
  } finally {
    pumping = false;
  }
}

import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import { renderProject } from "@/lib/editor-render";
import { renderInFork } from "@/lib/export-fork";
import {
  cancelExportJob,
  enqueueExportJob,
  ensureHydrated,
  getExportJob,
  listExportJobs,
  setExportRenderer,
} from "@/lib/export-jobs";
import type { ExportOptions, ProjectSpec } from "@/lib/editor-types";

export const runtime = "nodejs";
export const maxDuration = 600;

setExportRenderer((opts) => renderInFork(opts, renderProject));

type Params = { params: Promise<{ id: string }> };

/** Enqueue an export (returns immediately with jobId — poll GET for status). */
export async function POST(request: Request, { params }: Params) {
  try {
    await ensureHydrated();
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = (await request.json()) as ProjectSpec & {
      export?: Partial<ExportOptions>;
      /** Legacy: wait for completion in the same request. */
      wait?: boolean;
    };
    if (!body || !Array.isArray(body.clips)) {
      return NextResponse.json({ error: "Invalid project spec" }, { status: 400 });
    }
    const { export: exportOptions, wait, ...spec } = body;
    if (!spec.aspect) spec.aspect = project.aspect;

    const job = enqueueExportJob({ projectId: id, spec, exportOptions });

    if (wait) {
      // Poll in-process until terminal (legacy sync clients).
      const deadline = Date.now() + 9 * 60 * 1000;
      while (Date.now() < deadline) {
        const cur = getExportJob(job.id);
        if (!cur) break;
        if (cur.status === "done") {
          return NextResponse.json({
            jobId: cur.id,
            status: cur.status,
            previewUrl: cur.previewUrl,
            downloadUrl: cur.downloadUrl,
            outName: cur.outName,
          });
        }
        if (cur.status === "error" || cur.status === "cancelled") {
          return NextResponse.json(
            { jobId: cur.id, status: cur.status, error: cur.error || cur.status },
            { status: cur.status === "cancelled" ? 499 : 500 },
          );
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return NextResponse.json({ jobId: job.id, status: "running" });
    }

    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** List jobs, or fetch one with ?jobId= */
export async function GET(request: Request, { params }: Params) {
  await ensureHydrated();
  const { id } = await params;
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (jobId) {
    const job = getExportJob(jobId);
    if (!job || job.projectId !== id) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  }
  return NextResponse.json({ jobs: listExportJobs(id) });
}

/** Cancel a job (?jobId=) or the newest active job for this project. */
export async function DELETE(request: Request, { params }: Params) {
  await ensureHydrated();
  const { id } = await params;
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const ok = cancelExportJob(jobId || id);
  return NextResponse.json({ cancelled: ok });
}

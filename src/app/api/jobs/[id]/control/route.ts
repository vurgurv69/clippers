import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";

type Action = "pause" | "resume" | "cancel";

/**
 * Soft control for clip jobs:
 * - pause: set pauseRequested (honored between stages)
 * - resume: clear pause and continue if paused mid-pipeline (re-kick if needed)
 * - cancel: mark cancelled
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as { action?: Action };
    const action = body.action;
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (action === "pause") {
      const next = await updateJob(id, {
        pauseRequested: true,
        message: "Pause requested…",
        currentTask: "pausing",
      });
      return NextResponse.json({ job: next });
    }

    if (action === "cancel") {
      const next = await updateJob(id, {
        status: "cancelled",
        pauseRequested: false,
        message: "Cancelled",
        progress: 100,
        currentTask: "cancelled",
      });
      return NextResponse.json({ job: next });
    }

    if (action === "resume") {
      const wasStopped =
        job.status === "cancelled" || job.status === "error";
      const next = await updateJob(id, {
        pauseRequested: false,
        status: wasStopped ? "queued" : job.status === "paused" ? "analyzing" : job.status,
        message: "Resuming…",
        currentTask: "resume",
      });
      // Soft pause keeps the original process in checkpoint — clearing flags is enough.
      // Only restart after a hard stop.
      if (wasStopped) {
        void runPipeline(id, job.url);
      }
      return NextResponse.json({ job: next });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Control failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

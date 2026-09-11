import { NextResponse } from "next/server";
import fs from "fs";
import { getJob, jobClipPath } from "@/lib/jobs";
import { renderEdit } from "@/lib/edit-render";
import type { EditSpec } from "@/lib/edit-types";
import { assertSafeClipId, PathSafetyError } from "@/lib/safe-id";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ jobId: string; clipId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { jobId, clipId: rawClipId } = await params;
    const clipId = assertSafeClipId(rawClipId);
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const srcPath = jobClipPath(jobId, clipId, "mp4");
    if (!fs.existsSync(srcPath)) {
      return NextResponse.json({ error: "Clip file missing" }, { status: 404 });
    }

    const spec = (await request.json()) as EditSpec;
    if (!spec || !Array.isArray(spec.segments)) {
      return NextResponse.json({ error: "Invalid edit spec" }, { status: 400 });
    }

    const { outName } = await renderEdit({ jobId, clipId, spec });

    return NextResponse.json({
      previewUrl: `/api/edit/${jobId}/${clipId}/file/${outName}?t=${Date.now()}`,
      downloadUrl: `/api/edit/${jobId}/${clipId}/file/${outName}?download=1`,
      outName,
    });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

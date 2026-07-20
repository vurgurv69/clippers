import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getJob, jobDir } from "@/lib/jobs";

export const runtime = "nodejs";

type Params = { params: Promise<{ jobId: string; clipId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { jobId, clipId } = await params;
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const clip = job.clips.find((c) => c.id === clipId);
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const filePath = path.join(jobDir(jobId), "clips", `${clipId}.mp4`);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Clip file missing" }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const buffer = fs.readFileSync(filePath);
  const capTag = job.captionsEnabled ? "with-captions" : "no-captions";
  const base = (clip.title || clipId).replace(/[^\w\-]+/g, "_").slice(0, 50);
  const safeName = `${base}_${capTag}.mp4`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(buffer.length),
      "Content-Disposition": download
        ? `attachment; filename="${safeName}"`
        : `inline; filename="${safeName}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

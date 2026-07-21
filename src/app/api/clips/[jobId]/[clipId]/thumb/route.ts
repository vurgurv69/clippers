import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getJob, jobDir } from "@/lib/jobs";

export const runtime = "nodejs";

type Params = { params: Promise<{ jobId: string; clipId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { jobId, clipId } = await params;
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const filePath = path.join(jobDir(jobId), "clips", `${clipId}.jpg`);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Thumbnail missing" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

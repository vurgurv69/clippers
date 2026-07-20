import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getJob, jobDir } from "@/lib/jobs";

export const runtime = "nodejs";

type Params = { params: Promise<{ jobId: string; clipId: string }> };

const TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".mp4": "audio/mp4",
};

export async function GET(request: Request, { params }: Params) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const name = new URL(request.url).searchParams.get("name") || "";
  const safe = path.basename(name);
  if (!safe.startsWith("audio-")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(jobDir(jobId), "edit-assets", safe);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const type = TYPES[path.extname(safe).toLowerCase()] || "application/octet-stream";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}

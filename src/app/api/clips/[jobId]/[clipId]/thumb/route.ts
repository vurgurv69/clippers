import fs from "fs";
import { NextResponse } from "next/server";
import { getJob, jobClipPath } from "@/lib/jobs";
import { assertSafeClipId, PathSafetyError } from "@/lib/safe-id";

export const runtime = "nodejs";

type Params = { params: Promise<{ jobId: string; clipId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { jobId, clipId: rawClipId } = await params;
    const clipId = assertSafeClipId(rawClipId);
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const filePath = jobClipPath(jobId, clipId, "jpg");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Thumb missing" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

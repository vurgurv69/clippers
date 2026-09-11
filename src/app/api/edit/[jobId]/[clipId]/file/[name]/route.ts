import fs from "fs";
import { NextResponse } from "next/server";
import { getJob, jobDir } from "@/lib/jobs";
import {
  assertSafeClipId,
  PathSafetyError,
  resolveDataFile,
  safeBasename,
} from "@/lib/safe-id";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ jobId: string; clipId: string; name: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const { jobId, clipId: rawClipId, name } = await params;
    const clipId = assertSafeClipId(rawClipId);
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Only allow edited exports for this clip; block path traversal
    const safe = safeBasename(name);
    if (!safe.startsWith(`${clipId}-edit-`) || !safe.endsWith(".mp4")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const filePath = resolveDataFile(jobDir(jobId), "clips", safe);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File missing" }, { status: 404 });
    }

    const download = new URL(request.url).searchParams.get("download") === "1";
    const buffer = fs.readFileSync(filePath);
    const title = clipId.replace(/[^\w\-]+/g, "_").slice(0, 40);
    const outName = `${title}_edited.mp4`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.length),
        "Content-Disposition": download
          ? `attachment; filename="${outName}"`
          : `inline; filename="${outName}"`,
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

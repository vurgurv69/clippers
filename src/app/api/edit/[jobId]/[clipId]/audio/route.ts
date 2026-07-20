import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getJob, jobDir } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ jobId: string; clipId: string }> };

const ALLOWED = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".mp4", ".webm"]);

export async function POST(request: Request, { params }: Params) {
  try {
    const { jobId } = await params;
    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an audio file." }, { status: 400 });
    }
    if (file.size < 1000) {
      return NextResponse.json({ error: "That file is too small." }, { status: 400 });
    }
    if (file.size > 60 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio is too large (max ~60MB)." }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED.has(ext)) {
      return NextResponse.json(
        { error: "Use mp3, m4a, aac, wav or ogg." },
        { status: 400 },
      );
    }

    const assetsDir = path.join(jobDir(jobId), "edit-assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const filename = `audio-${Date.now()}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(assetsDir, filename), buf);

    return NextResponse.json({ filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audio upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

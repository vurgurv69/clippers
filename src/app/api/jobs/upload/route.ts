import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseCaptionsEnabled } from "@/lib/captions-flag";
import { createJob, jobDir, saveJob } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";
import type { AspectRatio, LayoutMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ASPECTS: AspectRatio[] = ["9:16", "1:1", "4:5", "16:9"];
const LAYOUTS: LayoutMode[] = ["auto", "fill", "face-top"];

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const aspectRaw = String(form.get("aspectRatio") || "9:16");
    const layoutRaw = String(form.get("layoutMode") || "auto");
    const captionsEnabled = parseCaptionsEnabled(
      form.get("captionsEnabled"),
      true,
    );
    const title = String(form.get("title") || "Uploaded video").slice(0, 120);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an MP4 file to upload." }, { status: 400 });
    }

    if (file.size < 50_000) {
      return NextResponse.json({ error: "File is too small to be a video." }, { status: 400 });
    }
    if (file.size > 800 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large (max ~800MB)." }, { status: 400 });
    }

    const aspectRatio = ASPECTS.includes(aspectRaw as AspectRatio)
      ? (aspectRaw as AspectRatio)
      : "9:16";
    const layoutMode = LAYOUTS.includes(layoutRaw as LayoutMode)
      ? (layoutRaw as LayoutMode)
      : "auto";

    const job = await createJob(`upload://${file.name}`, {
      aspectRatio,
      layoutMode,
      captionsEnabled,
    });
    job.title = title || file.name;
    await saveJob(job);

    const dest = path.join(jobDir(job.id), "source.mp4");
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buf);

    void runPipeline(job.id, job.url);

    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

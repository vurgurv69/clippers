import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { apiGate } from "@/lib/api-gate";
import { parseJobOptions } from "@/lib/job-options";
import { createJob, jobDir, saveJob } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";
import { PathSafetyError } from "@/lib/safe-id";
import {
  assertUploadSize,
  assertVideoMagic,
  UploadValidationError,
} from "@/lib/upload-validate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const gated = apiGate(request, {
    bucket: "jobs-upload",
    capacity: 8,
    refillPerSec: 0.2,
    cost: 2,
  });
  if (gated) return gated;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const title = String(form.get("title") || "Uploaded video").slice(0, 120);
    const opts = parseJobOptions(form);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an MP4 file to upload." }, { status: 400 });
    }

    try {
      assertUploadSize(file.size);
    } catch (err) {
      const message = err instanceof UploadValidationError ? err.message : "Invalid file size";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    try {
      assertVideoMagic(buf);
    } catch (err) {
      const message =
        err instanceof UploadValidationError ? err.message : "Unrecognized file type";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const job = await createJob(`upload://${file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80)}`, {
      aspectRatio: opts.aspectRatio,
      layoutMode: opts.layoutMode,
      captionsEnabled: opts.captionsEnabled,
      whisperQuality: opts.whisperQuality,
      captionTheme: opts.captionTheme,
      captionReadMode: opts.captionReadMode,
      captionEmojis: opts.captionEmojis,
      exportQuality: opts.clipMode === "social" ? "maximum" : opts.exportQuality,
      exportCodec: opts.clipMode === "social" ? "h264" : opts.exportCodec,
      preferHwEncode: opts.preferHwEncode,
      clipCount: opts.clipMode === "social" ? 1 : opts.clipCount,
      manualStartTime: opts.manualStartTime,
      manualEndTime: opts.manualEndTime,
      captionPrimary: opts.captionPrimary,
      captionHighlight: opts.captionHighlight,
      captionFont: opts.captionFont,
      captionAlign: opts.captionAlign,
      captionFontSize: opts.captionFontSize,
      captionOutline: opts.captionOutline,
      captionBox: opts.captionBox,
      removeWatermark: opts.clipMode === "social" ? true : opts.removeWatermark,
      clipMode: opts.clipMode,
      stripBurnIn: opts.stripBurnIn,
    });
    job.title = title || file.name;
    await saveJob(job);

    const dest = path.join(jobDir(job.id), "source.mp4");
    await fs.writeFile(dest, buf);

    void runPipeline(job.id, job.url);

    return NextResponse.json({ job });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

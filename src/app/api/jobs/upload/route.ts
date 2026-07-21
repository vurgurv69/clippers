import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseCaptionsEnabled } from "@/lib/captions-flag";
import { createJob, jobDir, saveJob } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ExportCodec,
  ExportQuality,
  LayoutMode,
  WhisperQuality,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ASPECTS: AspectRatio[] = ["9:16", "1:1", "4:5", "16:9"];
const LAYOUTS: LayoutMode[] = ["auto", "fill", "face-top"];
const WHISPER: WhisperQuality[] = ["fast", "balanced", "best"];
const CAP_MODES: CaptionReadMode[] = ["verbatim", "readable", "minimal"];
const THEMES: CaptionThemeId[] = [
  "tiktok-clean",
  "tiktok-bold",
  "hormozi",
  "podcast",
  "gaming",
  "minimal",
  "cinematic",
  "luxury",
  "neon",
  "youtube-shorts",
  "instagram-reels",
];
const EXPORT_Q: ExportQuality[] = ["high", "very-high", "maximum"];
const CODECS: ExportCodec[] = ["h264", "hevc", "av1", "vp9"];

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
    const whisperRaw = String(form.get("whisperQuality") || "fast");
    const themeRaw = String(form.get("captionTheme") || "tiktok-bold");
    const readRaw = String(form.get("captionReadMode") || "readable");
    const exportRaw = String(form.get("exportQuality") || "very-high");
    const codecRaw = String(form.get("exportCodec") || "h264");
    const preferHwEncode = String(form.get("preferHwEncode") ?? "true") !== "false";
    const captionEmojis = String(form.get("captionEmojis") ?? "true") !== "false";

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
    const whisperQuality = WHISPER.includes(whisperRaw as WhisperQuality)
      ? (whisperRaw as WhisperQuality)
      : "fast";
    const captionTheme = THEMES.includes(themeRaw as CaptionThemeId)
      ? (themeRaw as CaptionThemeId)
      : "tiktok-bold";
    const captionReadMode = CAP_MODES.includes(readRaw as CaptionReadMode)
      ? (readRaw as CaptionReadMode)
      : "readable";
    const exportQuality = EXPORT_Q.includes(exportRaw as ExportQuality)
      ? (exportRaw as ExportQuality)
      : "very-high";
    const exportCodec = CODECS.includes(codecRaw as ExportCodec)
      ? (codecRaw as ExportCodec)
      : "h264";

    const job = await createJob(`upload://${file.name}`, {
      aspectRatio,
      layoutMode,
      captionsEnabled,
      whisperQuality,
      captionTheme,
      captionReadMode,
      captionEmojis: Boolean(captionEmojis),
      exportQuality,
      exportCodec,
      preferHwEncode: Boolean(preferHwEncode),
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

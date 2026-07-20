import fs from "fs/promises";
import path from "path";
import { buildAssCaptions } from "./captions";
import { parseCaptionsEnabled } from "./captions-flag";
import { ffmpegPath, ffprobePath, runCommand } from "./binaries";
import { jobDir } from "./jobs";
import { buildVideoFilters, decideLayout } from "./layout";
import { detectScriptLanguage } from "./topic-title";
import type {
  AspectRatio,
  ClipPlan,
  LayoutMode,
  RenderedClip,
  TranscriptSegment,
} from "./types";
import { ASPECT_PRESETS } from "./types";

async function assertHasVideo(filePath: string) {
  const { stdout } = await runCommand(ffprobePath(), [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_type",
    "-of",
    "csv=p=0",
    filePath,
  ]);
  if (!stdout.trim().includes("video")) {
    throw new Error(
      `Clip render produced no video track (${path.basename(filePath)}).`,
    );
  }
}

function windowText(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): string {
  return segments
    .filter((s) => s.start < end && s.end > start)
    .map((s) => s.text)
    .join(" ");
}

async function renderOneClip(opts: {
  jobId: string;
  videoPath: string;
  plan: ClipPlan;
  segments: TranscriptSegment[];
  language: "ar" | "en";
  aspectRatio: AspectRatio;
  layoutMode: LayoutMode;
  captionsEnabled: boolean;
}): Promise<RenderedClip> {
  const {
    jobId,
    videoPath,
    plan,
    segments,
    aspectRatio,
    layoutMode,
  } = opts;
  // Strict: only burn when explicitly true
  const captionsEnabled = opts.captionsEnabled === true;
  const dir = jobDir(jobId);
  const clipsDir = path.join(dir, "clips");
  await fs.mkdir(clipsDir, { recursive: true });

  const preset = ASPECT_PRESETS[aspectRatio];
  const outW = preset.w;
  const outH = preset.h;
  const duration = Number((plan.end - plan.start).toFixed(2));
  const assName = `${plan.id}.ass`;
  const outName = `${plan.id}.mp4`;
  const assPath = path.join(clipsDir, assName);
  const outPath = path.join(clipsDir, outName);

  // Never reuse a leftover ASS from a previous captions-on render
  try {
    await fs.unlink(assPath);
  } catch {
    // ignore missing
  }

  const clipText = windowText(segments, plan.start, plan.end);
  const clipLang = detectScriptLanguage(clipText) || opts.language;

  const layout = await decideLayout({
    jobId,
    videoPath,
    clipStart: plan.start,
    clipEnd: plan.end,
    layoutMode,
  });

  if (captionsEnabled) {
    const ass = buildAssCaptions(
      segments,
      plan.start,
      plan.end,
      plan.title,
      clipLang,
    );
    await fs.writeFile(assPath, `\ufeff${ass}`, "utf8");
  }

  const filters = buildVideoFilters({
    outW,
    outH,
    assName: captionsEnabled ? assName : undefined,
    layout,
    captionsEnabled,
  });

  // Safety: never allow ass= in the filter graph when captions are off
  const graph = `${filters.vf || ""}${filters.filterComplex || ""}`;
  if (!captionsEnabled && /(?:^|[,;])ass=/.test(graph)) {
    throw new Error("Internal error: captions filter present while captions are off.");
  }

  const args = [
    "-y",
    "-ss",
    String(plan.start),
    "-i",
    videoPath,
    "-t",
    String(duration),
  ];

  if (filters.filterComplex) {
    args.push(
      "-filter_complex",
      filters.filterComplex,
      "-map",
      filters.mapVideo || "[vout]",
      "-map",
      "0:a:0?",
    );
  } else {
    args.push("-vf", filters.vf!, "-map", "0:v:0", "-map", "0:a:0?");
  }

  args.push(
    "-sn", // drop any soft subtitle streams from the source
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "17",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    outName,
  );

  await runCommand(ffmpegPath(), args, { cwd: clipsDir });
  await assertHasVideo(outPath);

  const cacheTag = captionsEnabled ? "cap1" : "cap0";
  const fileTag = captionsEnabled ? "captions" : "nocaptions";
  return {
    ...plan,
    filename: outName,
    duration,
    previewUrl: `/api/clips/${jobId}/${plan.id}?${cacheTag}`,
    downloadUrl: `/api/clips/${jobId}/${plan.id}?download=1&${cacheTag}&tag=${fileTag}`,
    layoutUsed: layout.mode,
  };
}

export async function renderClips(opts: {
  jobId: string;
  videoPath: string;
  plans: ClipPlan[];
  segments: TranscriptSegment[];
  language: "ar" | "en";
  aspectRatio: AspectRatio;
  layoutMode: LayoutMode;
  captionsEnabled?: boolean;
  onProgress?: (done: number, total: number) => Promise<void> | void;
}): Promise<RenderedClip[]> {
  const captionsEnabled = parseCaptionsEnabled(opts.captionsEnabled, true);
  const rendered: RenderedClip[] = [];
  for (let i = 0; i < opts.plans.length; i++) {
    const clip = await renderOneClip({
      jobId: opts.jobId,
      videoPath: opts.videoPath,
      plan: opts.plans[i],
      segments: opts.segments,
      language: opts.language,
      aspectRatio: opts.aspectRatio,
      layoutMode: opts.layoutMode,
      captionsEnabled,
    });
    rendered.push(clip);
    await opts.onProgress?.(i + 1, opts.plans.length);
  }
  return rendered;
}

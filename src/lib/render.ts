import fs from "fs/promises";
import path from "path";
import { buildAssCaptions } from "./captions";
import { parseCaptionsEnabled } from "./captions-flag";
import { ffmpegPath, ffprobePath, runCommand } from "./binaries";
import { videoEncodeArgs } from "./hw-encode";
import { jobDir } from "./jobs";
import { buildVideoFilters, decideLayout } from "./layout";
import { detectScriptLanguage } from "./topic-title";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ClipPlan,
  ExportCodec,
  ExportQuality,
  LayoutMode,
  RenderedClip,
  TranscriptSegment,
} from "./types";
import { ASPECT_PRESETS } from "./types";
import type { ExportQuality as HwQuality } from "./editor-types";

function mapHwQuality(q: ExportQuality = "very-high"): HwQuality {
  if (q === "maximum") return "high";
  if (q === "high") return "medium";
  return "high";
}

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

function encodePreset(q: ExportQuality = "very-high") {
  if (q === "maximum") {
    return { crf: "14", preset: "slow", audioBr: "256k", sharpen: "unsharp=5:5:0.6:5:5:0.0" };
  }
  if (q === "high") {
    return { crf: "18", preset: "veryfast", audioBr: "192k", sharpen: "unsharp=3:3:0.4:3:3:0.0" };
  }
  return { crf: "16", preset: "fast", audioBr: "224k", sharpen: "unsharp=5:5:0.5:5:5:0.0" };
}

/** Loudness normalize + light denoise + limiter (speech-friendly). */
function audioFilterChain() {
  return [
    "highpass=f=80",
    "afftdn=nf=-25",
    "acompressor=threshold=-18dB:ratio=3:attack=10:release=100",
    "loudnorm=I=-14:TP=-1.5:LRA=11",
    "alimiter=limit=0.95",
  ].join(",");
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
  captionTheme?: CaptionThemeId;
  captionReadMode?: CaptionReadMode;
  captionEmojis?: boolean;
  exportQuality?: ExportQuality;
  exportCodec?: ExportCodec;
  preferHwEncode?: boolean;
}): Promise<RenderedClip> {
  const {
    jobId,
    videoPath,
    plan,
    segments,
    aspectRatio,
    layoutMode,
  } = opts;
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
  const enc = encodePreset(opts.exportQuality || "very-high");

  try {
    await fs.unlink(assPath);
  } catch {
    // ignore
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
      {
        themeId: opts.captionTheme || "tiktok-bold",
        readMode: opts.captionReadMode || "readable",
        highlightMode: "word",
        emojis: opts.captionEmojis !== false,
        playResX: outW,
        playResY: outH,
      },
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

  const graph = `${filters.vf || ""}${filters.filterComplex || ""}`;
  if (!captionsEnabled && /(?:^|[,;])ass=/.test(graph)) {
    throw new Error("Internal error: captions filter present while captions are off.");
  }

  // Append light sharpen after layout (before captions if using -vf)
  const sharpen = enc.sharpen;
  let vf = filters.vf;
  let filterComplex = filters.filterComplex;
  let mapVideo = filters.mapVideo;

  if (filterComplex && mapVideo) {
    const label = mapVideo.replace(/[[\]]/g, "");
    filterComplex = `${filterComplex};[${label}]${sharpen}[vsharp]`;
    mapVideo = "[vsharp]";
  } else if (vf) {
    vf = `${vf},${sharpen}`;
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

  if (filterComplex) {
    args.push(
      "-filter_complex",
      filterComplex,
      "-map",
      mapVideo || "[vout]",
      "-map",
      "0:a:0?",
    );
  } else {
    args.push("-vf", vf!, "-map", "0:v:0", "-map", "0:a:0?");
  }

  args.push(
    "-af",
    audioFilterChain(),
    "-sn",
  );

  const codec = opts.exportCodec || "h264";
  const preferHw = opts.preferHwEncode !== false;
  const encVideo = await videoEncodeArgs({
    codec,
    quality: mapHwQuality(opts.exportQuality || "very-high"),
    preferHw,
  });
  // Prefer our CRF presets for software x264 when quality is very-high/max
  if (encVideo.encoder === "libx264") {
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      enc.preset,
      "-crf",
      enc.crf,
      "-pix_fmt",
      "yuv420p",
    );
  } else {
    args.push(...encVideo.args);
  }

  args.push(
    "-c:a",
    "aac",
    "-b:a",
    enc.audioBr,
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    outName,
  );

  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await runCommand(ffmpegPath(), args, { cwd: clipsDir });
      await assertHasVideo(outPath);
      lastErr = "";
      break;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt === 2) throw err;
    }
  }
  if (lastErr) throw new Error(lastErr);

  // Poster thumbnail (~1/3 into the clip)
  const thumbName = `${plan.id}.jpg`;
  const thumbPath = path.join(clipsDir, thumbName);
  try {
    await runCommand(ffmpegPath(), [
      "-y",
      "-ss",
      String(Math.max(0, plan.start + duration * 0.33)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      thumbPath,
    ]);
  } catch {
    // non-fatal
  }

  const cacheTag = captionsEnabled ? "cap1" : "cap0";
  const fileTag = captionsEnabled ? "captions" : "nocaptions";
  let thumbnailUrl: string | undefined;
  try {
    await fs.access(thumbPath);
    thumbnailUrl = `/api/clips/${jobId}/${plan.id}/thumb`;
  } catch {
    thumbnailUrl = undefined;
  }

  return {
    ...plan,
    filename: outName,
    duration,
    previewUrl: `/api/clips/${jobId}/${plan.id}?${cacheTag}`,
    downloadUrl: `/api/clips/${jobId}/${plan.id}?download=1&${cacheTag}&tag=${fileTag}`,
    thumbnailUrl,
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
  captionTheme?: CaptionThemeId;
  captionReadMode?: CaptionReadMode;
  captionEmojis?: boolean;
  exportQuality?: ExportQuality;
  exportCodec?: ExportCodec;
  preferHwEncode?: boolean;
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
      captionTheme: opts.captionTheme,
      captionReadMode: opts.captionReadMode,
      captionEmojis: opts.captionEmojis,
      exportQuality: opts.exportQuality,
      exportCodec: opts.exportCodec,
      preferHwEncode: opts.preferHwEncode,
    });
    rendered.push(clip);
    await opts.onProgress?.(i + 1, opts.plans.length);
  }
  return rendered;
}

import fs from "fs/promises";
import path from "path";
import { generateAssKaraoke } from "./generateAssKaraoke";
import { parseCaptionsEnabled } from "./captions-flag";
import { ffmpegPath, runCommand } from "./binaries";
import { probeHasAudio, probeHasVideo } from "./media-probe";
import { videoEncodeArgs } from "./hw-encode";
import { getJob, jobDir } from "./jobs";
import { decideLayout } from "./layout";
import { buildAssBurnArgs, buildFFmpegArgs, maxQualityVideoArgs } from "./ffmpeg-args";
import { extractClipWav } from "./transcribe";
import { detectScriptLanguage } from "./topic-title";
import { mapPool } from "./pool";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ClipMode,
  ClipPlan,
  ExportCodec,
  ExportQuality,
  LayoutMode,
  RenderedClip,
  TranscriptSegment,
} from "./types";
import { ASPECT_PRESETS } from "./types";
import type { ExportQuality as HwQuality } from "./editor-types";

/** Max simultaneous FFmpeg clip encodes — keeps CPU/GPU from thrashing. */
const RENDER_CONCURRENCY = Math.max(
  1,
  Math.min(2, Number(process.env.CLIP_RENDER_CONCURRENCY || 2) || 2),
);

function mapHwQuality(q: ExportQuality = "very-high"): HwQuality {
  if (q === "maximum") return "high";
  if (q === "high") return "medium";
  return "high";
}

async function assertHasVideo(filePath: string) {
  if (!(await probeHasVideo(filePath))) {
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
    return { crf: "15", preset: "medium", audioBr: "320k" };
  }
  if (q === "high") {
    return { crf: "18", preset: "fast", audioBr: "192k" };
  }
  // very-high — sharp local default (was ultrafast/soft)
  return { crf: "16", preset: "fast", audioBr: "256k" };
}

function audioFilterChain() {
  return [
    "aresample=48000:async=1:first_pts=0",
    "highpass=f=70",
    "dynaudnorm=f=75:g=12:p=0.9",
    "alimiter=limit=0.95",
  ].join(",");
}

function shiftWordsToZero(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
): TranscriptSegment[] {
  const words = segments.flatMap((s) => s.words || []).filter((w) => {
    return w.end > clipStart && w.start < clipEnd && w.word.trim();
  });
  if (!words.length) {
    const text = windowText(segments, clipStart, clipEnd).trim();
    if (!text) return [];
    return [
      {
        id: 0,
        start: 0,
        end: Math.max(0.4, clipEnd - clipStart),
        text,
        words: text.split(/\s+/).map((word, i, parts) => {
          const span = Math.max(0.4, clipEnd - clipStart);
          const step = span / parts.length;
          return {
            word,
            start: i * step,
            end: (i + 1) * step,
          };
        }),
      },
    ];
  }
  const shifted = words.map((w) => ({
    ...w,
    start: Math.max(0, w.start - clipStart),
    end: Math.max(0.05, w.end - clipStart),
  }));
  return [
    {
      id: 0,
      start: 0,
      end: Math.max(...shifted.map((w) => w.end), 0.4),
      text: shifted.map((w) => w.word).join(" "),
      words: shifted,
    },
  ];
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
  whisperQuality?: string;
  captionPrimary?: string;
  captionHighlight?: string;
  captionFont?: string;
  captionAlign?: string;
  captionFontSize?: number;
  captionOutline?: number;
  captionBox?: boolean;
  removeWatermark?: boolean;
  downloadHint?: import("./types").DownloadHint;
  clipMode?: ClipMode;
  stripBurnIn?: boolean;
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
  const duration = Number((plan.end - plan.start).toFixed(2));
  const assName = `${plan.id}.ass`;
  const outName = `${plan.id}.mp4`;
  const wavName = `${plan.id}-audio.wav`;
  const assPath = path.join(clipsDir, assName);
  const outPath = path.join(clipsDir, outName);
  const wavPath = path.join(clipsDir, wavName);
  const enc = encodePreset(opts.exportQuality || "very-high");

  const layout = await decideLayout({
    jobId,
    videoPath,
    clipStart: plan.start,
    clipEnd: plan.end,
    layoutMode,
  });

  const codec = opts.exportCodec || "h264";
  const preferHw = opts.preferHwEncode !== false;
  const encVideo = await videoEncodeArgs({
    codec,
    quality: mapHwQuality(opts.exportQuality || "very-high"),
    preferHw,
  });
  const social = opts.clipMode === "social" || opts.exportQuality === "maximum";
  const videoCodecArgs = social
    ? encVideo.encoder === "libx264" || encVideo.encoder.startsWith("lib")
      ? maxQualityVideoArgs()
      : [...encVideo.args, "-r", "60"]
    : encVideo.encoder === "libx264"
      ? [
          "-c:v",
          "libx264",
          "-preset",
          enc.preset,
          "-crf",
          enc.crf,
          "-profile:v",
          "high",
          "-pix_fmt",
          "yuv420p",
        ]
      : encVideo.args;

  const hasAudio = await probeHasAudio(videoPath);

  const cutArgs = (audioMode: "full" | "simple" | "raw") =>
    buildFFmpegArgs({
      inputPath: videoPath,
      outputPath: outName,
      aspect: aspectRatio,
      layoutMode: layout.mode,
      start: plan.start,
      to: plan.end,
      duration,
      face: layout.face,
      hasAudio,
      audioFilter:
        audioMode === "full"
          ? audioFilterChain()
          : audioMode === "simple"
            ? "aresample=48000:async=1:first_pts=0,dynaudnorm=f=150:g=10"
            : undefined,
      videoCodecArgs,
      audioBr: social ? "320k" : enc.audioBr,
      removeWatermark: opts.removeWatermark ?? social,
      downloadHint: opts.downloadHint,
      stripBurnIn: opts.stripBurnIn,
      fps60: social ? (audioMode === "raw" ? "dup" : "blend") : "off",
      copyAudio: social && audioMode === "full",
      maxQuality: social,
    });

  let lastErr = "";
  const modes: Array<"full" | "simple" | "raw"> = ["full", "simple", "raw"];
  for (let attempt = 0; attempt < modes.length; attempt++) {
    try {
      await runCommand(ffmpegPath(), cutArgs(modes[attempt]), { cwd: clipsDir });
      await assertHasVideo(outPath);
      lastErr = "";
      break;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt === modes.length - 1) throw err;
    }
  }
  if (lastErr) throw new Error(lastErr);

  if (captionsEnabled) {
    try {
      const shifted = shiftWordsToZero(segments, plan.start, plan.end);
      const hasWords = shifted.some((s) => s.words?.length || s.text.trim());
      const karaokeOpts = {
        playResX: preset.w,
        playResY: preset.h,
        themeId: opts.captionTheme || "tiktok-bold",
        readMode: opts.captionReadMode || "verbatim",
        whisperQuality: opts.whisperQuality,
        primaryColor: opts.captionPrimary,
        highlightColor: opts.captionHighlight,
        fontFamily: opts.captionFont,
        align: opts.captionAlign,
        fontSize: opts.captionFontSize,
        outlineWidth: opts.captionOutline,
        boxStyle: opts.captionBox,
        transcript: shifted,
        language:
          detectScriptLanguage(windowText(segments, plan.start, plan.end)) ||
          opts.language,
      };

      // Reuse the job transcript whenever possible — skips per-clip Whisper.
      let heard = hasWords
        ? await generateAssKaraoke("", karaokeOpts)
        : null;

      if (!heard?.segments.some((s) => s.words?.length || s.text.trim())) {
        await extractClipWav(outPath, wavPath);
        heard = await generateAssKaraoke(wavPath, karaokeOpts);
      }

      const ass = heard.ass;
      await fs.writeFile(assPath, ass, "utf8");
      const burned = path.join(clipsDir, `${plan.id}.cap.mp4`);
      await runCommand(
        ffmpegPath(),
        buildAssBurnArgs({
          inputPath: outPath,
          outputPath: burned,
          assPath,
          videoCodecArgs,
        }),
      );
      await fs.unlink(outPath).catch(() => undefined);
      await fs.rename(burned, outPath);
      await assertHasVideo(outPath);
    } catch {
      // Keep the cut clip if karaoke burn fails
    }
  }

  const thumbName = `${plan.id}.jpg`;
  const thumbPath = path.join(clipsDir, thumbName);
  try {
    await runCommand(ffmpegPath(), [
      "-y",
      "-ss",
      String(Math.max(0, duration * 0.33)),
      "-i",
      outPath,
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
  whisperQuality?: string;
  captionPrimary?: string;
  captionHighlight?: string;
  captionFont?: string;
  captionAlign?: string;
  captionFontSize?: number;
  captionOutline?: number;
  captionBox?: boolean;
  removeWatermark?: boolean;
  downloadHint?: import("./types").DownloadHint;
  clipMode?: ClipMode;
  stripBurnIn?: boolean;
  onProgress?: (
    done: number,
    total: number,
    clips: RenderedClip[],
  ) => Promise<void> | void;
}): Promise<RenderedClip[]> {
  const captionsEnabled = parseCaptionsEnabled(opts.captionsEnabled, true);
  const slots: Array<RenderedClip | null> = new Array(opts.plans.length).fill(null);
  let completed = 0;

  await mapPool(opts.plans, RENDER_CONCURRENCY, async (plan, i) => {
    const live = await getJob(opts.jobId);
    if (live?.status === "cancelled") {
      throw new Error("Job cancelled");
    }
    const clip = await renderOneClip({
      jobId: opts.jobId,
      videoPath: opts.videoPath,
      plan,
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
      whisperQuality: opts.whisperQuality,
      captionPrimary: opts.captionPrimary,
      captionHighlight: opts.captionHighlight,
      captionFont: opts.captionFont,
      captionAlign: opts.captionAlign,
      captionFontSize: opts.captionFontSize,
      captionOutline: opts.captionOutline,
      captionBox: opts.captionBox,
      removeWatermark: opts.removeWatermark,
      downloadHint: opts.downloadHint,
      clipMode: opts.clipMode,
      stripBurnIn: opts.stripBurnIn,
    });
    slots[i] = clip;
    completed += 1;
    const soFar = slots.filter((c): c is RenderedClip => c != null);
    await opts.onProgress?.(completed, opts.plans.length, soFar);
    return clip;
  });

  return slots.filter((c): c is RenderedClip => c != null);
}

import { pickViralClips } from "./ai-clips";
import { buildClipAnalytics, buildSourceChapters } from "./clip-analytics";
import { downloadVideo, type DownloadHint } from "./download";
import { diarizeSegments } from "./diarize";
import { ffprobePath, runCommand } from "./binaries";
import { parseCaptionsEnabled } from "./captions-flag";
import { getJob, jobDir, updateJob } from "./jobs";
import { renderClips } from "./render";
import { sampleMeters } from "./system-meters";
import { transcribeVideo } from "./transcribe";
import fs from "fs/promises";
import path from "path";
import type { WhisperQuality } from "./types";

async function probeDuration(videoPath: string): Promise<number> {
  const { stdout } = await runCommand(ffprobePath(), [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  const n = Number.parseFloat(stdout.trim());
  return Number.isFinite(n) ? n : 0;
}

async function patchMeters(jobId: string) {
  const m = sampleMeters();
  await updateJob(jobId, {
    cpuPercent: m.cpuPercent,
    memoryMb: m.memoryMb,
  });
}

/** Honor soft pause between stages; cancel if requested. */
async function checkpoint(jobId: string) {
  for (;;) {
    const job = await getJob(jobId);
    if (!job) return;
    if (job.status === "cancelled") {
      throw new Error("Job cancelled");
    }
    if (job.pauseRequested || job.status === "paused") {
      await updateJob(jobId, {
        status: "paused",
        message: "Paused — resume when ready",
        currentTask: "paused",
        pauseRequested: true,
      });
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    return;
  }
}

export async function runPipeline(jobId: string, url: string) {
  try {
    const existing = await getJob(jobId);
    const aspectRatio = existing?.aspectRatio || "9:16";
    const layoutMode = existing?.layoutMode || "auto";
    let captionsEnabled = parseCaptionsEnabled(existing?.captionsEnabled, true);
    const localSource = path.join(jobDir(jobId), "source.mp4");
    const whisperQuality = (existing?.whisperQuality || "fast") as WhisperQuality;

    let videoPath = localSource;
    let title = existing?.title || "Uploaded video";
    let duration = existing?.duration || 0;

    let hasLocal = false;
    try {
      const st = await fs.stat(localSource);
      hasLocal = st.size > 50_000;
    } catch {
      hasLocal = false;
    }

    await checkpoint(jobId);
    await patchMeters(jobId);

    if (hasLocal && (url.startsWith("upload://") || !url.startsWith("http"))) {
      await updateJob(jobId, {
        status: "downloading",
        progress: 12,
        message: "Using your uploaded video…",
        currentTask: "local upload",
      });
      duration = await probeDuration(localSource);
      title = existing?.title || "Uploaded video";
    } else {
      const hint = (existing?.downloadHint || "auto") as DownloadHint;
      const pullMsg =
        hint === "tiktok" || url.includes("tiktok")
          ? "Pulling TikTok HD (no watermark)…"
          : hint === "instagram" || url.includes("instagram")
            ? "Pulling Instagram HD…"
            : hint === "facebook" || url.includes("facebook") || url.includes("fb.")
              ? "Pulling Facebook video HQ…"
              : hint === "x" || url.includes("twitter") || url.includes("x.com")
                ? "Pulling X / Twitter video…"
                : hint === "twitch" || url.includes("twitch")
                  ? "Pulling Twitch clip…"
                  : hint === "kick" || url.includes("kick.com")
                    ? "Pulling Kick clip…"
                    : hint === "vimeo" || url.includes("vimeo")
                      ? "Pulling Vimeo HQ…"
                      : "Downloading highest-quality stream (cache when possible)…";
      await updateJob(jobId, {
        status: "downloading",
        progress: 8,
        message: pullMsg,
        currentTask: "download",
      });
      const downloaded = await downloadVideo(jobId, url, hint);
      videoPath = downloaded.videoPath;
      title = downloaded.title;
      duration = downloaded.duration;
    }

    await checkpoint(jobId);
    await patchMeters(jobId);

    const whisperLabel =
      whisperQuality === "best"
        ? "Best Whisper"
        : whisperQuality === "balanced"
          ? "Balanced Whisper"
          : "Fast Whisper";

    await updateJob(jobId, {
      status: "transcribing",
      progress: 28,
      message: `${whisperLabel} — listening for hooks…`,
      title,
      duration,
      currentTask: "transcribe",
    });
    let { segments, language } = await transcribeVideo(
      jobId,
      videoPath,
      async (pct, message) => {
        await updateJob(jobId, {
          status: "transcribing",
          progress: pct,
          message,
          currentTask: "transcribe",
        });
        if (pct % 8 < 2) await patchMeters(jobId);
      },
      whisperQuality,
    );

    // Speaker diarization (heuristic)
    const dia = diarizeSegments(segments, 3);
    segments = dia.segments;
    await updateJob(jobId, { speakerCount: dia.speakerCount });

    await checkpoint(jobId);
    await patchMeters(jobId);

    await updateJob(jobId, {
      status: "analyzing",
      progress: 52,
      message: segments.length
        ? "Scoring hooks, retention & emotion for viral cuts…"
        : "Picking loud/active moments (thin transcript)…",
      currentTask: "analyze",
    });
    const plans = await pickViralClips({
      jobId,
      videoPath,
      title,
      duration,
      segments,
    });

    const chapters = buildSourceChapters(plans);
    await updateJob(jobId, { chapters });

    const fresh = await getJob(jobId);
    captionsEnabled = parseCaptionsEnabled(fresh?.captionsEnabled, true);

    await checkpoint(jobId);

    await updateJob(jobId, {
      status: "rendering",
      progress: 65,
      captionsEnabled,
      message: captionsEnabled
        ? `Pro export · ${plans.length} ${aspectRatio} clips + polished captions…`
        : `Pro export · ${plans.length} ${aspectRatio} clips (captions OFF)…`,
      currentTask: "render",
    });

    const clips = await renderClips({
      jobId,
      videoPath,
      plans,
      segments,
      language,
      aspectRatio,
      layoutMode,
      captionsEnabled,
      captionTheme: fresh?.captionTheme || existing?.captionTheme,
      captionReadMode: fresh?.captionReadMode || existing?.captionReadMode,
      captionEmojis: fresh?.captionEmojis ?? existing?.captionEmojis,
      exportQuality: fresh?.exportQuality || existing?.exportQuality,
      exportCodec: fresh?.exportCodec || existing?.exportCodec || "h264",
      preferHwEncode: fresh?.preferHwEncode ?? existing?.preferHwEncode ?? true,
      onProgress: async (done, total) => {
        const progress = 65 + Math.round((done / total) * 30);
        await updateJob(jobId, {
          status: "rendering",
          progress,
          message: `Rendering clip ${done} of ${total} (audio + sharpen)…`,
          currentTask: "render",
        });
        await patchMeters(jobId);
      },
    });

    // Attach analytics per clip
    const enriched = clips.map((c) => {
      const a = buildClipAnalytics({
        plan: c,
        segments,
        duration: c.duration,
        hasCaptions: captionsEnabled,
        layoutUsed: c.layoutUsed,
      });
      return {
        ...c,
        analytics: {
          viralityScore: a.viralityScore,
          retentionScore: a.retentionScore,
          hookScore: a.hookScore,
          captionQuality: a.captionQuality,
          editingQuality: a.editingQuality,
          seoScore: a.seoScore,
          recommendations: a.recommendations,
        },
      };
    });

    const top = enriched[0]?.analytics;
    await updateJob(jobId, {
      status: "done",
      progress: 100,
      message: "Your clips are ready to share",
      clips: enriched,
      etaMs: 0,
      currentTask: "done",
      chapters,
      analyticsSummary: top
        ? {
            seoScore: top.seoScore,
            editingQuality: top.editingQuality,
            platformFit: buildClipAnalytics({
              plan: enriched[0],
              segments,
              duration: enriched[0].duration,
              hasCaptions: captionsEnabled,
              layoutUsed: enriched[0].layoutUsed,
            }).platformFit,
            recommendations: top.recommendations,
          }
        : undefined,
      pauseRequested: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    if (/cancelled/i.test(message)) {
      await updateJob(jobId, {
        status: "cancelled",
        progress: 100,
        message: "Cancelled",
        error: message,
        currentTask: "cancelled",
      });
      return;
    }
    await updateJob(jobId, {
      status: "error",
      progress: 100,
      message: "Failed",
      error: message,
      currentTask: "error",
    });
  }
}

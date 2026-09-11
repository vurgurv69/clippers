import { pickViralClips } from "./ai-clips";
import { buildClipAnalytics, buildSourceChapters } from "./clip-analytics";
import { downloadVideo, type DownloadHint } from "./download";
import { diarizeSegments } from "./diarize";
import { parseCaptionsEnabled } from "./captions-flag";
import { getJob, jobDir, updateJob } from "./jobs";
import { probeDuration } from "./media-probe";
import { clampClipCount, formatClock, resolveManualRange } from "./parse-time";
import { renderClips } from "./render";
import { sampleMeters } from "./system-meters";
import { transcribeVideo } from "./transcribe";
import fs from "fs/promises";
import path from "path";
import type { ClipPlan, RenderedClip, TranscriptSegment, WhisperQuality } from "./types";

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
    const isSocial = existing?.clipMode === "social";

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
      let hint = (existing?.downloadHint || "auto") as DownloadHint;
      if (isSocial && hint === "auto") {
        if (/tiktok/i.test(url)) hint = "tiktok";
        else if (/instagram|instagr\.am/i.test(url)) hint = "instagram";
      }
      const pullMsg =
        hint === "tiktok" || url.includes("tiktok")
          ? isSocial
            ? "Social clean · TikTok no-watermark APIs + Cobalt…"
            : "Pulling TikTok HD (no watermark)…"
          : hint === "instagram" || url.includes("instagram")
            ? isSocial
              ? "Social clean · Instagram HD + Cobalt…"
              : "Pulling Instagram HD…"
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
      const downloaded = await downloadVideo(jobId, url, hint, {
        cobaltFirst: isSocial,
      });
      videoPath = downloaded.videoPath;
      title = downloaded.title;
      duration = downloaded.duration;
    }

    await checkpoint(jobId);
    await patchMeters(jobId);

    const clipCount = clampClipCount(existing?.clipCount, 4);
    const manual = resolveManualRange(
      existing?.manualStartTime,
      existing?.manualEndTime,
      duration,
    );

    const whisperLabel =
      whisperQuality === "best"
        ? "Best accuracy"
        : whisperQuality === "balanced"
          ? "Balanced"
          : "Fast";

    let segments: TranscriptSegment[] = [];
    let language: "ar" | "en" = "en";
    let plans: ClipPlan[] = [];

    if (isSocial && !manual) {
      await updateJob(jobId, {
        status: "analyzing",
        progress: 48,
        title,
        duration,
        message: "Social clean · preparing full export…",
        currentTask: "social-clean",
      });
      plans = [
        {
          id: "clip-1",
          title: title || "Clean repost",
          hook: "Clean social export",
          start: 0,
          end: Number(duration.toFixed(3)),
          viralityScore: 88,
          reason: "Social Clean · logo cover + high-quality export",
        },
      ];
    } else if (manual) {
      await updateJob(jobId, {
        status: "analyzing",
        progress: 48,
        title,
        duration,
        message: `Using section ${formatClock(manual.start)}–${formatClock(manual.end)}`,
        currentTask: "manual-range",
      });
      plans = [
        {
          id: "clip-1",
          title: `Section ${formatClock(manual.start)}–${formatClock(manual.end)}`,
          hook: "Your selected time range",
          start: manual.start,
          end: manual.end,
          viralityScore: 90,
          reason: "Manual section override",
        },
      ];
    } else {
      await updateJob(jobId, {
        status: "transcribing",
        progress: 28,
        message: `${whisperLabel} speech pass — listening for hooks…`,
        title,
        duration,
        currentTask: "transcribe",
      });
      const heard = await transcribeVideo(
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
      segments = heard.segments;
      language = heard.language;

      const dia = diarizeSegments(segments, 4);
      segments = dia.segments;
      await updateJob(jobId, { speakerCount: dia.speakerCount });

      await checkpoint(jobId);
      await patchMeters(jobId);

      await updateJob(jobId, {
        status: "analyzing",
        progress: 52,
        message: segments.length
          ? `Local scoring — picking ${clipCount} heuristic cuts…`
          : `Picking ${clipCount} loud/active moments…`,
        currentTask: "analyze",
      });
      plans = await pickViralClips({
        jobId,
        videoPath,
        title,
        duration,
        segments,
        clipCount,
      });
    }

    const chapters = buildSourceChapters(plans);
    await updateJob(jobId, { chapters });

    const fresh = await getJob(jobId);
    captionsEnabled = parseCaptionsEnabled(fresh?.captionsEnabled, true);

    await checkpoint(jobId);

    await updateJob(jobId, {
      status: "rendering",
      progress: 65,
      captionsEnabled,
      clips: [],
      message: captionsEnabled
        ? `Rendering clip 1 of ${plans.length}`
        : `Rendering clip 1 of ${plans.length} (captions OFF)`,
      currentTask: "render",
    });

    const enrich = (c: RenderedClip): RenderedClip => {
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
    };

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
      captionPrimary: fresh?.captionPrimary || existing?.captionPrimary,
      captionHighlight: fresh?.captionHighlight || existing?.captionHighlight,
      captionFont: fresh?.captionFont || existing?.captionFont,
      captionAlign: fresh?.captionAlign || existing?.captionAlign,
      captionFontSize: fresh?.captionFontSize ?? existing?.captionFontSize,
      captionOutline: fresh?.captionOutline ?? existing?.captionOutline,
      captionBox: fresh?.captionBox ?? existing?.captionBox,
      removeWatermark: isSocial
        ? true
        : fresh?.removeWatermark ?? existing?.removeWatermark ?? true,
      downloadHint: (fresh?.downloadHint || existing?.downloadHint) as DownloadHint | undefined,
      clipMode: isSocial ? "social" : "viral",
      stripBurnIn: Boolean(fresh?.stripBurnIn ?? existing?.stripBurnIn),
      exportQuality: fresh?.exportQuality || existing?.exportQuality,
      exportCodec: fresh?.exportCodec || existing?.exportCodec || "h264",
      preferHwEncode: fresh?.preferHwEncode ?? existing?.preferHwEncode ?? true,
      whisperQuality,
      onProgress: async (done, total, soFar) => {
        const progress = 65 + Math.round((done / total) * 30);
        const next = done < total ? done + 1 : done;
        await updateJob(jobId, {
          status: "rendering",
          progress,
          clips: soFar.map(enrich),
          message:
            done < total
              ? `Rendering clip ${next} of ${total}`
              : `Finished clip ${done} of ${total}`,
          currentTask: "render",
        });
        await patchMeters(jobId);
      },
    });

    const enriched = clips.map(enrich);

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

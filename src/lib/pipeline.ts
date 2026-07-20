import { pickViralClips } from "./ai-clips";
import { downloadVideo } from "./download";
import { ffprobePath, runCommand } from "./binaries";
import { parseCaptionsEnabled } from "./captions-flag";
import { getJob, jobDir, updateJob } from "./jobs";
import { renderClips } from "./render";
import { transcribeVideo } from "./transcribe";
import fs from "fs/promises";
import path from "path";

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

export async function runPipeline(jobId: string, url: string) {
  try {
    const existing = await getJob(jobId);
    const aspectRatio = existing?.aspectRatio || "9:16";
    const layoutMode = existing?.layoutMode || "auto";
    // Re-read right before render too — never trust a stale in-memory flag
    let captionsEnabled = parseCaptionsEnabled(existing?.captionsEnabled, true);
    const localSource = path.join(jobDir(jobId), "source.mp4");

    let videoPath = localSource;
    let title = existing?.title || "Uploaded video";
    let duration = existing?.duration || 0;

    // Upload jobs already have source.mp4 — skip network download
    let hasLocal = false;
    try {
      const st = await fs.stat(localSource);
      hasLocal = st.size > 50_000;
    } catch {
      hasLocal = false;
    }

    if (hasLocal && (url.startsWith("upload://") || !url.startsWith("http"))) {
      await updateJob(jobId, {
        status: "downloading",
        progress: 12,
        message: "Using your uploaded video…",
      });
      duration = await probeDuration(localSource);
      title = existing?.title || "Uploaded video";
    } else {
      await updateJob(jobId, {
        status: "downloading",
        progress: 8,
        message:
          url.includes("tiktok")
            ? "Pulling HD TikTok (no watermark when available)…"
            : "Downloading the full video…",
      });
      const downloaded = await downloadVideo(jobId, url);
      videoPath = downloaded.videoPath;
      title = downloaded.title;
      duration = downloaded.duration;
    }

    await updateJob(jobId, {
      status: "transcribing",
      progress: 28,
      message: "Listening in Arabic or English (local Whisper)…",
      title,
      duration,
    });
    const { segments, language } = await transcribeVideo(jobId, videoPath);

    await updateJob(jobId, {
      status: "analyzing",
      progress: 52,
      message: "Picking moments and writing topic titles from what was said…",
    });
    const plans = await pickViralClips({
      jobId,
      videoPath,
      title,
      duration,
      segments,
    });

    const fresh = await getJob(jobId);
    captionsEnabled = parseCaptionsEnabled(fresh?.captionsEnabled, true);

    await updateJob(jobId, {
      status: "rendering",
      progress: 65,
      captionsEnabled,
      message: captionsEnabled
        ? `Editing ${plans.length} ${aspectRatio} clips with captions…`
        : `Editing ${plans.length} ${aspectRatio} clips — captions OFF…`,
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
      onProgress: async (done, total) => {
        const progress = 65 + Math.round((done / total) * 30);
        await updateJob(jobId, {
          status: "rendering",
          progress,
          message: `Rendering clip ${done} of ${total}…`,
        });
      },
    });

    await updateJob(jobId, {
      status: "done",
      progress: 100,
      message: "Your clips are ready to share",
      clips,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    await updateJob(jobId, {
      status: "error",
      progress: 100,
      message: "Failed",
      error: message,
    });
  }
}

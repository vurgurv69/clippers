import { NextResponse } from "next/server";
import { apiGate } from "@/lib/api-gate";
import { createJob, getJob, listJobs } from "@/lib/jobs";
import { HINTS, parseJobOptions } from "@/lib/job-options";
import { runPipeline } from "@/lib/pipeline";
import type { DownloadHint } from "@/lib/types";
import { assertSafeMediaUrl, UrlSafetyError } from "@/lib/url-safety";

export const runtime = "nodejs";
export const maxDuration = 300;

// Kick Whisper singleton warm on first jobs traffic (backup for instrumentation).
void import("@/lib/whisper")
  .then((m) => m.warmWhisper("fast"))
  .catch(() => undefined);

const HINT_HOST: Partial<Record<DownloadHint, (host: string) => boolean>> = {
  tiktok: (h) => h.includes("tiktok"),
  instagram: (h) => h.includes("instagram") || h.includes("instagr.am"),
  facebook: (h) =>
    h.includes("facebook.com") || h.includes("fb.watch") || h.includes("fb.com"),
  x: (h) => h === "x.com" || h.includes("twitter.com") || h.includes("t.co"),
  twitch: (h) => h.includes("twitch.tv") || h.includes("clips.twitch.tv"),
  kick: (h) => h.includes("kick.com"),
  vimeo: (h) => h.includes("vimeo.com"),
  youtube: (h) =>
    h.includes("youtube.com") || h.includes("youtu.be") || h.includes("youtube-nocookie.com"),
};

export async function GET(request: Request) {
  const gated = apiGate(request, {
    bucket: "jobs-poll",
    capacity: 60,
    refillPerSec: 2,
  });
  if (gated) return gated;

  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (id) {
      const job = await getJob(id);
      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({ job });
    }
    const jobs = await listJobs(30);
    return NextResponse.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        url: j.url,
        status: j.status,
        progress: j.progress,
        message: j.message,
        createdAt: j.createdAt,
        clipCount: j.clips?.length || 0,
        aspectRatio: j.aspectRatio,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gated = apiGate(request, {
    bucket: "jobs-post",
    capacity: 10,
    refillPerSec: 0.25,
    cost: 2,
  });
  if (gated) return gated;

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      url?: string;
    };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "Paste a video link first." }, { status: 400 });
    }

    let safeUrl: URL;
    try {
      safeUrl = await assertSafeMediaUrl(url);
    } catch (err) {
      const message =
        err instanceof UrlSafetyError ? err.message : "That doesn't look like a valid URL.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const opts = parseJobOptions(body);
    const downloadHint = HINTS.includes(opts.downloadHint) ? opts.downloadHint : "auto";

    const hostCheck = HINT_HOST[downloadHint];
    if (hostCheck) {
      const host = safeUrl.hostname.toLowerCase();
      if (!hostCheck(host)) {
        const label =
          downloadHint === "x"
            ? "X (Twitter)"
            : downloadHint.charAt(0).toUpperCase() + downloadHint.slice(1);
        return NextResponse.json(
          { error: `Paste a ${label} link for that button.` },
          { status: 400 },
        );
      }
    }

    const canonical = safeUrl.toString();
    const job = await createJob(canonical, {
      aspectRatio: opts.aspectRatio,
      layoutMode: opts.layoutMode,
      captionsEnabled: opts.captionsEnabled,
      downloadHint,
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
    void runPipeline(job.id, canonical);

    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

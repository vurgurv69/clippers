import { NextResponse } from "next/server";
import { createJob, listJobs } from "@/lib/jobs";
import { parseCaptionsEnabled } from "@/lib/captions-flag";
import { runPipeline } from "@/lib/pipeline";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  DownloadHint,
  ExportCodec,
  ExportQuality,
  LayoutMode,
  WhisperQuality,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ASPECTS: AspectRatio[] = ["9:16", "1:1", "4:5", "16:9"];
const LAYOUTS: LayoutMode[] = ["auto", "fill", "face-top"];
const HINTS: DownloadHint[] = [
  "auto",
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "x",
  "twitch",
  "kick",
  "vimeo",
];
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

export async function GET() {
  try {
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
  try {
    const body = (await request.json()) as {
      url?: string;
      aspectRatio?: string;
      layoutMode?: string;
      captionsEnabled?: unknown;
      downloadHint?: string;
      whisperQuality?: string;
      captionTheme?: string;
      captionReadMode?: string;
      captionEmojis?: unknown;
      exportQuality?: string;
      exportCodec?: string;
      preferHwEncode?: unknown;
    };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "Paste a video link first." }, { status: 400 });
    }

    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("bad protocol");
      }
    } catch {
      return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
    }

    const aspectRatio = ASPECTS.includes(body.aspectRatio as AspectRatio)
      ? (body.aspectRatio as AspectRatio)
      : "9:16";
    const layoutMode = LAYOUTS.includes(body.layoutMode as LayoutMode)
      ? (body.layoutMode as LayoutMode)
      : "auto";
    const captionsEnabled = parseCaptionsEnabled(body.captionsEnabled, true);
    const downloadHint = HINTS.includes(body.downloadHint as DownloadHint)
      ? (body.downloadHint as DownloadHint)
      : "auto";
    const whisperQuality = WHISPER.includes(body.whisperQuality as WhisperQuality)
      ? (body.whisperQuality as WhisperQuality)
      : "fast";
    const captionTheme = THEMES.includes(body.captionTheme as CaptionThemeId)
      ? (body.captionTheme as CaptionThemeId)
      : "tiktok-bold";
    const captionReadMode = CAP_MODES.includes(body.captionReadMode as CaptionReadMode)
      ? (body.captionReadMode as CaptionReadMode)
      : "readable";
    const exportQuality = EXPORT_Q.includes(body.exportQuality as ExportQuality)
      ? (body.exportQuality as ExportQuality)
      : "very-high";
    const exportCodec = CODECS.includes(body.exportCodec as ExportCodec)
      ? (body.exportCodec as ExportCodec)
      : "h264";
    const preferHwEncode =
      body.preferHwEncode !== false && body.preferHwEncode !== "false";
    const captionEmojis = body.captionEmojis !== false && body.captionEmojis !== "false";

    const hostCheck = HINT_HOST[downloadHint];
    if (hostCheck) {
      const host = new URL(url).hostname.toLowerCase();
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

    const job = await createJob(url, {
      aspectRatio,
      layoutMode,
      captionsEnabled,
      downloadHint,
      whisperQuality,
      captionTheme,
      captionReadMode,
      captionEmojis,
      exportQuality,
      exportCodec,
      preferHwEncode,
    });
    void runPipeline(job.id, url);

    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

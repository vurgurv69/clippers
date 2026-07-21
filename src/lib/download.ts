import fs from "fs/promises";
import path from "path";
import { ffmpegPath, ffprobePath, runCommand, ytDlpPath } from "./binaries";
import { jobDir } from "./jobs";
import {
  downloadInstagramHd,
  downloadTikTokNoWatermark,
} from "./tiktok-api";
import { readCachedDownload, writeCachedDownload } from "./download-cache";
import type { DownloadHint } from "./types";

export type DownloadedVideo = {
  videoPath: string;
  title: string;
  duration: number;
};

export type { DownloadHint };

const MEDIA_EXTS = [".mp4", ".mkv", ".webm", ".mov", ".m4a", ".m4v"];

type Platform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "x"
  | "twitch"
  | "kick"
  | "vimeo"
  | "other";

/** Prefer best video+audio — allow up to 4K when available, prefer 1080+. */
const HQ_FORMAT =
  "bv*[height<=2160]+ba/b[height<=2160]/bv*[height<=1440]+ba/bv*[height<=1080]+ba/bv*+ba/b/best";

function detectPlatform(url: string): Platform {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (
    host.includes("tiktok.com") ||
    host.includes("tiktokv.com") ||
    host === "vm.tiktok.com" ||
    host === "vt.tiktok.com"
  ) {
    return "tiktok";
  }
  if (
    host.includes("instagram.com") ||
    host.includes("instagr.am") ||
    host.includes("cdninstagram.com")
  ) {
    return "instagram";
  }
  if (
    host.includes("facebook.com") ||
    host.includes("fb.watch") ||
    host.includes("fb.com")
  ) {
    return "facebook";
  }
  if (
    host === "x.com" ||
    host.includes("twitter.com") ||
    host.includes("t.co")
  ) {
    return "x";
  }
  if (host.includes("twitch.tv") || host.includes("clips.twitch.tv")) {
    return "twitch";
  }
  if (host.includes("kick.com")) {
    return "kick";
  }
  if (host.includes("vimeo.com")) {
    return "vimeo";
  }
  if (
    host.includes("youtube.com") ||
    host.includes("youtu.be") ||
    host.includes("youtube-nocookie.com")
  ) {
    return "youtube";
  }
  return "other";
}

function resolvePlatform(url: string, hint: DownloadHint = "auto"): Platform {
  if (hint === "tiktok") return "tiktok";
  if (hint === "instagram") return "instagram";
  if (hint === "youtube") return "youtube";
  if (hint === "facebook") return "facebook";
  if (hint === "x") return "x";
  if (hint === "twitch") return "twitch";
  if (hint === "kick") return "kick";
  if (hint === "vimeo") return "vimeo";
  return detectPlatform(url);
}

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

async function probeHasVideo(videoPath: string): Promise<boolean> {
  try {
    const { stdout } = await runCommand(ffprobePath(), [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      videoPath,
    ]);
    return stdout.trim().includes("video");
  } catch {
    return false;
  }
}

async function probeHasAudio(videoPath: string): Promise<boolean> {
  try {
    const { stdout } = await runCommand(ffprobePath(), [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      videoPath,
    ]);
    return stdout.trim().includes("audio");
  } catch {
    return false;
  }
}

async function probeHeight(videoPath: string): Promise<number> {
  try {
    const { stdout } = await runCommand(ffprobePath(), [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=height",
      "-of",
      "csv=p=0",
      videoPath,
    ]);
    return Number.parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function isMediaFile(name: string) {
  const lower = name.toLowerCase();
  return MEDIA_EXTS.some((ext) => lower.endsWith(ext));
}

async function listMedia(dir: string) {
  const names = await fs.readdir(dir);
  return names.filter(isMediaFile);
}

async function clearPartialDownloads(dir: string) {
  const names = await fs.readdir(dir);
  await Promise.all(
    names
      .filter(
        (n) =>
          isMediaFile(n) ||
          n.endsWith(".part") ||
          n.endsWith(".ytdl") ||
          n.endsWith(".temp") ||
          n.includes("source.work-"),
      )
      .map((n) => fs.unlink(path.join(dir, n)).catch(() => undefined)),
  );
}

const COMMON_ARGS = (ff: string) => [
  "--no-playlist",
  "--newline",
  "--ffmpeg-location",
  ff,
  "--js-runtimes",
  "node",
  "--no-warnings",
  "--retries",
  "12",
  "--fragment-retries",
  "12",
  "--retry-sleep",
  "2",
  "--socket-timeout",
  "45",
  "--continue",
  "--add-header",
  "Accept-Language:en-US,en;q=0.9",
];

async function fetchTitle(
  url: string,
  ff: string,
  platform: Platform,
): Promise<string> {
  // TikTok / IG webpage via yt-dlp often TLS-resets — skip
  if (platform === "tiktok" || platform === "instagram") return "";
  try {
    const extra =
      platform === "youtube"
        ? ["--extractor-args", "youtube:player_client=android,ios,web"]
        : [];
    const { stdout } = await runCommand(ytDlpPath(), [
      ...COMMON_ARGS(ff),
      "--skip-download",
      ...extra,
      "--print",
      "%(title)s",
      url,
    ]);
    const title = stdout.trim().split("\n").filter(Boolean).pop();
    return title && title !== "NA" ? title : "";
  } catch {
    return "";
  }
}

async function mergeToMp4(
  videoFile: string,
  audioFile: string | null,
  outPath: string,
) {
  const sameAsVideo = path.resolve(videoFile) === path.resolve(outPath);
  const sameAsAudio =
    audioFile != null && path.resolve(audioFile) === path.resolve(outPath);
  const target =
    sameAsVideo || sameAsAudio
      ? path.join(path.dirname(outPath), `source.work-${Date.now()}.mp4`)
      : outPath;

  const args = ["-y", "-i", videoFile];
  if (audioFile) args.push("-i", audioFile);
  args.push(
    "-map",
    "0:v:0",
    ...(audioFile ? ["-map", "1:a:0"] : ["-map", "0:a:0?"]),
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
    "-shortest",
    target,
  );
  await runCommand(ffmpegPath(), args);

  if (target !== outPath) {
    await fs.unlink(outPath).catch(() => undefined);
    await fs.rename(target, outPath);
  }
}

type DownloadAttempt = {
  label: string;
  args: string[];
};

function buildAttempts(
  ff: string,
  outTemplate: string,
  url: string,
  platform: Platform,
): DownloadAttempt[] {
  const base = [
    ...COMMON_ARGS(ff),
    "--merge-output-format",
    "mp4",
    "-o",
    outTemplate,
    "--print",
    "after_move:%(title)s|||%(filepath)s",
  ];

  if (platform === "tiktok" || platform === "instagram") {
    // Skip yt-dlp — dedicated no-watermark / HD helpers in downloadVideo().
    return [];
  }

  if (platform === "youtube") {
    return [
      {
        label: "android/ios HQ",
        args: [
          ...base,
          "--extractor-args",
          "youtube:player_client=android,ios",
          "-f",
          HQ_FORMAT,
          url,
        ],
      },
      {
        label: "tv/android HQ",
        args: [
          ...base,
          "--extractor-args",
          "youtube:player_client=tv_embedded,android",
          "-f",
          HQ_FORMAT,
          url,
        ],
      },
      {
        label: "web + mweb HQ",
        args: [
          ...base,
          "--extractor-args",
          "youtube:player_client=web,mweb",
          "-f",
          HQ_FORMAT,
          url,
        ],
      },
      {
        label: "android progressive fallback",
        args: [
          ...base,
          "--extractor-args",
          "youtube:player_client=android",
          "-f",
          "22/18/b",
          url,
        ],
      },
    ];
  }

  // Generic / other sites — best available quality
  return [
    {
      label: "best HQ",
      args: [...base, "-f", HQ_FORMAT, url],
    },
    {
      label: "impersonate chrome",
      args: [
        ...base,
        "--impersonate",
        "chrome-131:android-14",
        "-f",
        "bv*+ba/b/best",
        url,
      ],
    },
  ];
}

export async function downloadVideo(
  jobId: string,
  url: string,
  hint: DownloadHint = "auto",
): Promise<DownloadedVideo> {
  // Reuse local cache when available
  const cached = await readCachedDownload(url);
  if (cached && cached.duration > 0) {
    const dir = jobDir(jobId);
    await fs.mkdir(dir, { recursive: true });
    const finalPath = path.join(dir, "source.mp4");
    await fs.copyFile(cached.videoPath, finalPath);
    return {
      videoPath: finalPath,
      title: cached.title,
      duration: cached.duration || (await probeDuration(finalPath)),
    };
  }

  const dir = jobDir(jobId);
  const outTemplate = path.join(dir, "source.%(ext)s").replace(/\\/g, "/");
  const ff = ffmpegPath().replace(/\\/g, "/");
  const platform = resolvePlatform(url, hint);

  const titleFromInfo = await fetchTitle(url, ff, platform);

  let stdout = "";
  let lastError = "";
  let downloaded = false;
  const errors: string[] = [];

  for (const attempt of buildAttempts(ff, outTemplate, url, platform)) {
    await clearPartialDownloads(dir);
    try {
      const result = await runCommand(ytDlpPath(), attempt.args);
      stdout = result.stdout;
      const files = await listMedia(dir);
      if (files.length) {
        downloaded = true;
        break;
      }
      lastError = `Attempt "${attempt.label}" finished with no files.`;
      errors.push(lastError);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      errors.push(`[${attempt.label}] ${lastError.slice(0, 240)}`);
    }
  }

  if (!downloaded && platform === "tiktok") {
    try {
      await clearPartialDownloads(dir);
      const finalPath = path.join(dir, "source.mp4");
      const api = await downloadTikTokNoWatermark(url, finalPath);
      const duration = await probeDuration(finalPath);
      if (!(await probeHasVideo(finalPath))) {
        throw new Error("Downloaded file has no video track");
      }
      const title = titleFromInfo || api.title || "TikTok video";
      void writeCachedDownload({
        url,
        sourcePath: finalPath,
        title,
        duration,
      });
      return {
        videoPath: finalPath,
        title,
        duration,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${msg}\n\nUse the Upload MP4 button — TikTok is blocked on this network.`,
      );
    }
  }

  if (!downloaded && platform === "instagram") {
    try {
      await clearPartialDownloads(dir);
      const finalPath = path.join(dir, "source.mp4");
      const api = await downloadInstagramHd(url, finalPath);
      const duration = await probeDuration(finalPath);
      if (!(await probeHasVideo(finalPath))) {
        throw new Error("Downloaded file has no video track");
      }
      const title = titleFromInfo || api.title || "Instagram video";
      void writeCachedDownload({
        url,
        sourcePath: finalPath,
        title,
        duration,
      });
      return {
        videoPath: finalPath,
        title,
        duration,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Last resort: yt-dlp for Instagram
      try {
        await clearPartialDownloads(dir);
        await runCommand(ytDlpPath(), [
          ...COMMON_ARGS(ff),
          "--merge-output-format",
          "mp4",
          "-o",
          outTemplate,
          "-f",
          HQ_FORMAT,
          "--impersonate",
          "chrome-131:android-14",
          url,
        ]);
        downloaded = (await listMedia(dir)).length > 0;
        if (!downloaded) throw new Error(msg);
      } catch {
        throw new Error(
          `${msg}\n\nUse a public Instagram Reel/post link, or upload an MP4.`,
        );
      }
    }
  }

  if (!downloaded) {
    const tip =
      platform === "youtube"
        ? "YouTube tip: try again in a minute, or paste a different public link."
        : platform === "instagram"
          ? "Instagram tip: use a public Reel/post URL, or tap Instagram HD."
          : "Tip: make sure the link is public — or upload an MP4.";
    throw new Error(
      `Download failed (${platform}).\n${tip}\n${errors.slice(-4).join("\n").slice(0, 900)}`,
    );
  }

  const files = await listMedia(dir);
  const candidates = await Promise.all(
    files.map(async (f) => {
      const full = path.join(dir, f);
      return {
        name: f,
        full,
        hasVideo: await probeHasVideo(full),
        hasAudio: await probeHasAudio(full),
        height: await probeHeight(full),
      };
    }),
  );

  candidates.sort((a, b) => b.height - a.height);

  const merged = candidates.find((c) => c.hasVideo && c.hasAudio);
  const videoOnly = candidates.find((c) => c.hasVideo && !c.hasAudio);
  const audioOnly = candidates.find((c) => c.hasAudio && !c.hasVideo);

  const finalPath = path.join(dir, "source.mp4");
  let videoPath = finalPath;

  if (merged) {
    if (path.resolve(merged.full) === path.resolve(finalPath)) {
      videoPath = merged.full;
    } else {
      await mergeToMp4(merged.full, null, finalPath);
      videoPath = finalPath;
    }
  } else if (videoOnly && audioOnly) {
    await mergeToMp4(videoOnly.full, audioOnly.full, finalPath);
    videoPath = finalPath;
  } else if (videoOnly) {
    if (path.resolve(videoOnly.full) === path.resolve(finalPath)) {
      videoPath = videoOnly.full;
    } else {
      await mergeToMp4(videoOnly.full, null, finalPath);
      videoPath = finalPath;
    }
  } else {
    throw new Error(
      "Downloaded media has no video track. Try another link (Clippers needs the picture, not just audio).",
    );
  }

  if (!(await probeHasVideo(videoPath))) {
    throw new Error("Merged file is missing video — cannot make visual clips.");
  }

  const metaLine = stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .find((l) => l.includes("|||"));
  const title =
    titleFromInfo ||
    metaLine?.split("|||")[0]?.trim() ||
    "Untitled video";

  const duration = await probeDuration(videoPath);
  const result = { videoPath, title, duration };
  void writeCachedDownload({
    url,
    sourcePath: videoPath,
    title,
    duration,
  });
  return result;
}

import fs from "fs/promises";
import path from "path";
import { ffmpegPath, ffprobePath, runCommand, ytDlpPath } from "./binaries";
import { jobDir } from "./jobs";
import { downloadTikTokNoWatermark } from "./tiktok-api";

export type DownloadedVideo = {
  videoPath: string;
  title: string;
  duration: number;
};

const MEDIA_EXTS = [".mp4", ".mkv", ".webm", ".mov", ".m4a", ".m4v"];

type Platform = "youtube" | "tiktok" | "other";

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
    host.includes("youtube.com") ||
    host.includes("youtu.be") ||
    host.includes("youtube-nocookie.com")
  ) {
    return "youtube";
  }
  return "other";
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
  "8",
  "--fragment-retries",
  "8",
  "--retry-sleep",
  "2",
  "--socket-timeout",
  "30",
  "--add-header",
  "Accept-Language:en-US,en;q=0.9",
];

async function fetchTitle(
  url: string,
  ff: string,
  platform: Platform,
): Promise<string> {
  // TikTok webpage via yt-dlp often TLS-resets on Windows — skip
  if (platform === "tiktok") return "";
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

  if (platform === "tiktok") {
    // Skip yt-dlp for TikTok — curl TLS resets on many Windows/ISP setups.
    // downloadVideo() goes straight to the no-watermark helper APIs.
    return [];
  }

  if (platform === "youtube") {
    return [
      {
        label: "android/ios HD",
        args: [
          ...base,
          "--extractor-args",
          "youtube:player_client=android,ios",
          "-f",
          "bv*[height<=1080]+ba/b[height<=1080]/b",
          url,
        ],
      },
      {
        label: "tv/android HD",
        args: [
          ...base,
          "--extractor-args",
          "youtube:player_client=tv_embedded,android",
          "-f",
          "bv*[height<=1080]+ba/b[height<=1080]/b",
          url,
        ],
      },
      {
        label: "web + mweb",
        args: [
          ...base,
          "--extractor-args",
          "youtube:player_client=web,mweb",
          "-f",
          "bv*[height<=1080]+ba/b[height<=1080]/b",
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
          "18/22/b",
          url,
        ],
      },
    ];
  }

  // Generic / other sites
  return [
    {
      label: "best",
      args: [...base, "-f", "bv*+ba/b", url],
    },
    {
      label: "impersonate chrome",
      args: [
        ...base,
        "--impersonate",
        "chrome-131:android-14",
        "-f",
        "b/best",
        url,
      ],
    },
  ];
}

export async function downloadVideo(
  jobId: string,
  url: string,
): Promise<DownloadedVideo> {
  const dir = jobDir(jobId);
  const outTemplate = path.join(dir, "source.%(ext)s").replace(/\\/g, "/");
  const ff = ffmpegPath().replace(/\\/g, "/");
  const platform = detectPlatform(url);

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
      return {
        videoPath: finalPath,
        title: titleFromInfo || api.title || "TikTok video",
        duration,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${msg}\n\nUse “Or upload MP4” under the link box — TikTok is blocked on this network.`,
      );
    }
  }

  if (!downloaded) {
    const tip =
      platform === "youtube"
        ? "YouTube tip: try again in a minute, or paste a different public link."
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
  return { videoPath, title, duration };
}

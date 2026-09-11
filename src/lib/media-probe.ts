import { ffmpegPath, runCommand, tryFfprobePath } from "./binaries";

function parseClock(raw: string): number {
  const m = raw.trim().match(/^(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function parseFfmpegBanner(text: string): {
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  height: number;
} {
  const dur = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/i);
  const vh = text.match(/Video:[\s\S]*?(\d{2,4})x(\d{2,4})/i);
  return {
    duration: dur ? parseClock(dur[1]) : 0,
    hasVideo: /Stream:.*Video:|Video:/i.test(text),
    hasAudio: /Stream:.*Audio:|Audio:/i.test(text),
    height: vh ? Number(vh[2]) || 0 : 0,
  };
}

async function ffmpegBanner(videoPath: string): Promise<string> {
  try {
    await runCommand(ffmpegPath(), ["-hide_banner", "-i", videoPath]);
    return "";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function probeDuration(videoPath: string): Promise<number> {
  const ffprobe = tryFfprobePath();
  if (ffprobe) {
    try {
      const { stdout } = await runCommand(ffprobe, [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        videoPath,
      ]);
      const n = Number.parseFloat(stdout.trim());
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      // fall through to ffmpeg
    }
  }
  return parseFfmpegBanner(await ffmpegBanner(videoPath)).duration;
}

export async function probeHasVideo(videoPath: string): Promise<boolean> {
  const ffprobe = tryFfprobePath();
  if (ffprobe) {
    try {
      const { stdout } = await runCommand(ffprobe, [
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
      if (stdout.trim().includes("video")) return true;
    } catch {
      // fall through
    }
  }
  return parseFfmpegBanner(await ffmpegBanner(videoPath)).hasVideo;
}

export async function probeHasAudio(videoPath: string): Promise<boolean> {
  const ffprobe = tryFfprobePath();
  if (ffprobe) {
    try {
      const { stdout } = await runCommand(ffprobe, [
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
      if (stdout.trim().includes("audio")) return true;
    } catch {
      // fall through
    }
  }
  return parseFfmpegBanner(await ffmpegBanner(videoPath)).hasAudio;
}

export async function probeSize(
  videoPath: string,
): Promise<{ w: number; h: number }> {
  const ffprobe = tryFfprobePath();
  if (ffprobe) {
    try {
      const { stdout } = await runCommand(ffprobe, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        videoPath,
      ]);
      const [w, h] = stdout.trim().split(",").map((n) => Number.parseInt(n, 10));
      if (w && h) return { w, h };
    } catch {
      // fall through
    }
  }
  const banner = parseFfmpegBanner(await ffmpegBanner(videoPath));
  const vh = (await ffmpegBanner(videoPath)).match(
    /Video:[\s\S]*?(\d{2,4})x(\d{2,4})/i,
  );
  if (vh) {
    return { w: Number(vh[1]) || 1280, h: Number(vh[2]) || 720 };
  }
  return { w: 1280, h: banner.height || 720 };
}

export async function probeHeight(videoPath: string): Promise<number> {
  const size = await probeSize(videoPath);
  return size.h;
}

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export function ffmpegPath() {
  const env = process.env.FFMPEG_PATH;
  if (env && fs.existsSync(env)) return env;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p || !fs.existsSync(p)) {
    throw new Error("ffmpeg-static binary missing. Reinstall ffmpeg-static.");
  }
  return p;
}

export function ffprobePath() {
  const env = process.env.FFPROBE_PATH;
  if (env && fs.existsSync(env)) return env;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("ffprobe-static") as { path: string };
  if (!mod?.path || !fs.existsSync(mod.path)) {
    throw new Error("ffprobe-static binary missing. Reinstall ffprobe-static.");
  }
  return mod.path;
}

export function ytDlpPath() {
  const env = process.env.YT_DLP_PATH;
  if (env && fs.existsSync(env)) return env;
  const local = path.join(process.cwd(), "tools", "yt-dlp.exe");
  if (fs.existsSync(local)) return local;
  const unix = path.join(process.cwd(), "tools", "yt-dlp");
  if (fs.existsSync(unix)) return unix;
  throw new Error(
    "yt-dlp not found. Run: npm run setup:tools  (downloads yt-dlp into /tools)",
  );
}

export function runCommand(
  bin: string,
  args: string[],
  opts: { cwd?: string; signal?: AbortSignal } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error("Cancelled"));
      return;
    }
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const onAbort = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) {
        reject(new Error("Cancelled"));
        return;
      }
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(
            `${path.basename(bin)} failed (exit ${code}):\n${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

export function toFfmpegPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

function curlBin() {
  return process.platform === "win32" ? "curl.exe" : "curl";
}

function runCurl(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(curlBin(), args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function curlJson(url: string, referer?: string): Promise<unknown> {
  const args = [
    "-4",
    "-sS",
    "-L",
    "--max-time",
    "45",
    "-A",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "-H",
    "Accept: application/json",
  ];
  if (referer) {
    args.push("-H", `Referer: ${referer}`);
  }
  args.push(url);

  const { code, stdout, stderr } = await runCurl(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || `curl exit ${code}`);
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Bad JSON: ${stdout.slice(0, 160)}`);
  }
}

async function curlDownloadFile(
  url: string,
  outPath: string,
  referer: string,
): Promise<void> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.part`;
  const args = [
    "-4",
    "-sS",
    "-L",
    "--max-time",
    "240",
    "-A",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "-H",
    `Referer: ${referer}`,
    "-o",
    tmp,
    url,
  ];
  const { code, stderr } = await runCurl(args);
  if (code !== 0) {
    await fs.unlink(tmp).catch(() => undefined);
    throw new Error(stderr.trim() || `curl download exit ${code}`);
  }
  const stat = await fs.stat(tmp);
  if (stat.size < 40_000) {
    await fs.unlink(tmp).catch(() => undefined);
    throw new Error("Downloaded file was too small");
  }
  await fs.unlink(outPath).catch(() => undefined);
  await fs.rename(tmp, outPath);
}

function normalizeTikTokUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    if (u.hostname.includes("tiktok.com")) {
      const m = u.pathname.match(/\/video\/(\d+)/);
      if (m) {
        const user = u.pathname.match(/@([^/]+)/)?.[1] || "video";
        return `https://www.tiktok.com/@${user}/video/${m[1]}`;
      }
    }
    return u.toString();
  } catch {
    return input.trim();
  }
}

async function resolveViaTikWm(
  tiktokUrl: string,
): Promise<{ title: string; videoUrl: string }> {
  const clean = normalizeTikTokUrl(tiktokUrl);
  const endpoints = [
    `https://www.tikwm.com/api/?url=${encodeURIComponent(clean)}&hd=1`,
    `https://tikwm.com/api/?url=${encodeURIComponent(clean)}&hd=1`,
  ];
  let last = "tikwm failed";
  for (const endpoint of endpoints) {
    try {
      const raw = (await curlJson(endpoint, "https://www.tikwm.com/")) as {
        code?: number;
        msg?: string;
        data?: {
          title?: string;
          play?: string;
          hdplay?: string;
          wmplay?: string;
        };
      };
      if (raw.code !== 0 || !raw.data) {
        last = raw.msg || `tikwm code ${raw.code}`;
        continue;
      }
      // Prefer HD no-watermark; never use wmplay
      const videoUrl = raw.data.hdplay || raw.data.play;
      if (!videoUrl) {
        last = "No HD/play URL in response";
        continue;
      }
      return {
        title: (raw.data.title || "TikTok video").trim(),
        videoUrl,
      };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(last);
}

/** Cobalt — TikTok + Instagram (and more) at max quality when available. */
async function resolveViaCobalt(
  mediaUrl: string,
  fallbackTitle: string,
): Promise<{ title: string; videoUrl: string }> {
  const clean = mediaUrl.trim();
  const hosts = [
    "https://cobalt-api.kwiatekmieniany.pl/",
    "https://api.cobalt.tools/",
  ];
  let last = "cobalt failed";

  for (const host of hosts) {
    const tmpJson = path.join(
      process.cwd(),
      ".data",
      `_cobalt-${Date.now()}.json`,
    );
    try {
      await fs.mkdir(path.dirname(tmpJson), { recursive: true });
      // Prefer max / 1080 no-watermark style streams
      for (const quality of ["max", "2160", "1440", "1080"] as const) {
        const body = JSON.stringify({
          url: clean,
          videoQuality: quality,
          downloadMode: "auto",
          filenameStyle: "basic",
        });
        const args = [
          "-4",
          "-sS",
          "-L",
          "--max-time",
          "45",
          "-A",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0",
          "-H",
          "Content-Type: application/json",
          "-H",
          "Accept: application/json",
          "-d",
          body,
          "-o",
          tmpJson,
          host,
        ];
        const { code, stderr } = await runCurl(args);
        if (code !== 0) {
          last = stderr.trim() || `curl exit ${code}`;
          continue;
        }
        const raw = JSON.parse(await fs.readFile(tmpJson, "utf8")) as {
          status?: string;
          url?: string;
          tunnel?: string;
          filename?: string;
          error?: { code?: string };
          text?: string;
        };
        const videoUrl = raw.url || raw.tunnel;
        if (!videoUrl) {
          last = raw.error?.code || raw.text || `status ${raw.status}`;
          continue;
        }
        return {
          title: (raw.filename || fallbackTitle).replace(/\.[^.]+$/, ""),
          videoUrl,
        };
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    } finally {
      await fs.unlink(tmpJson).catch(() => undefined);
    }
  }
  throw new Error(last);
}

async function ensureCurl() {
  try {
    await runCurl(["--version"]);
  } catch {
    throw new Error(
      process.platform === "win32"
        ? "Windows curl.exe not found. Update Windows or upload an MP4 instead."
        : "curl not found. Install curl or upload an MP4 instead.",
    );
  }
}

/**
 * HD TikTok without watermark (helper APIs — you stay on Clippers).
 */
export async function downloadTikTokNoWatermark(
  tiktokUrl: string,
  outPath: string,
): Promise<{ title: string }> {
  await ensureCurl();

  const errors: string[] = [];
  const resolvers: Array<{
    name: string;
    fn: () => Promise<{ title: string; videoUrl: string }>;
  }> = [
    { name: "tikwm", fn: () => resolveViaTikWm(tiktokUrl) },
    {
      name: "cobalt",
      fn: () => resolveViaCobalt(tiktokUrl, "TikTok video"),
    },
  ];

  for (const { name, fn } of resolvers) {
    try {
      const { title, videoUrl } = await fn();
      await curlDownloadFile(videoUrl, outPath, "https://www.tiktok.com/");
      return { title: title || "TikTok video" };
    } catch (err) {
      errors.push(
        `${name}: ${err instanceof Error ? err.message : String(err)}`.slice(
          0,
          200,
        ),
      );
    }
  }

  throw new Error(
    `Could not pull TikTok HD (no watermark) automatically (${errors.join(" | ")}).`,
  );
}

/**
 * Instagram Reels / posts via Cobalt (no watermark when the source allows).
 */
export async function downloadInstagramHd(
  instagramUrl: string,
  outPath: string,
): Promise<{ title: string }> {
  await ensureCurl();

  try {
    const { title, videoUrl } = await resolveViaCobalt(
      instagramUrl,
      "Instagram video",
    );
    await curlDownloadFile(videoUrl, outPath, "https://www.instagram.com/");
    return { title: title || "Instagram video" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not pull Instagram HD automatically (${msg}). Use a public Reel/post link, or upload an MP4.`,
    );
  }
}

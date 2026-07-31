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

async function curlJson(
  url: string,
  opts: {
    referer?: string;
    method?: "GET" | "POST";
    body?: string;
    headers?: string[];
  } = {},
): Promise<unknown> {
  const args = [
    "-4",
    "-sS",
    "-L",
    "--max-time",
    "45",
    "-A",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "-H",
    "Accept: application/json, text/plain, */*",
  ];
  if (opts.referer) args.push("-H", `Referer: ${opts.referer}`);
  for (const h of opts.headers || []) args.push("-H", h);
  if (opts.method === "POST") {
    args.push("-X", "POST");
    if (opts.body) args.push("-d", opts.body);
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

function normalizeInstagramUrl(input: string): string {
  try {
    const u = new URL(input.trim());
    const m = u.pathname.match(/\/(reel|reels|p|tv)\/([^/?#]+)/i);
    if (m) {
      const kind = m[1].toLowerCase() === "reels" ? "reel" : m[1].toLowerCase();
      return `https://www.instagram.com/${kind}/${m[2]}/`;
    }
    return u.toString();
  } catch {
    return input.trim();
  }
}

function pickMp4Url(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^https?:\/\//i.test(s) && (/\.mp4(\?|$)/i.test(s) || /video/i.test(s))) {
      return s;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = pickMp4Url(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of [
      "hdplay",
      "play",
      "videoUrl",
      "video_url",
      "download_url",
      "downloadUrl",
      "url",
      "tunnel",
      "media",
      "source",
    ]) {
      const hit = pickMp4Url(obj[key], depth + 1);
      if (hit) return hit;
    }
    for (const v of Object.values(obj)) {
      const hit = pickMp4Url(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
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
      const raw = (await curlJson(endpoint, {
        referer: "https://www.tikwm.com/",
      })) as {
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

/** Cobalt — only when an instance accepts us (optional API key). */
async function resolveViaCobalt(
  mediaUrl: string,
  fallbackTitle: string,
): Promise<{ title: string; videoUrl: string }> {
  const clean = mediaUrl.trim();
  const envHost = process.env.COBALT_API_URL?.trim();
  const apiKey =
    process.env.COBALT_API_KEY?.trim() ||
    process.env.COBALT_API_TOKEN?.trim() ||
    "";
  const hosts = [
    ...(envHost ? [envHost.endsWith("/") ? envHost : `${envHost}/`] : []),
    // Public instances often require JWT now — skipped unless key is set
    ...(apiKey
      ? [
          "https://api.cobalt.tools/",
          "https://cobalt-api.kwiatekmieniany.pl/",
        ]
      : []),
  ];

  if (!hosts.length) {
    throw new Error(
      "cobalt skipped (set COBALT_API_URL + COBALT_API_KEY for Cobalt)",
    );
  }

  let last = "cobalt failed";

  for (const host of hosts) {
    const tmpJson = path.join(
      process.cwd(),
      ".data",
      `_cobalt-${Date.now()}.json`,
    );
    try {
      await fs.mkdir(path.dirname(tmpJson), { recursive: true });
      for (const quality of ["max", "1080", "720"] as const) {
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
        ];
        if (apiKey) {
          const scheme = apiKey.includes(".") ? "Bearer" : "Api-Key";
          args.push("-H", `Authorization: ${scheme} ${apiKey}`);
        }
        args.push("-d", body, "-o", tmpJson, host);

        const { code, stderr } = await runCurl(args);
        if (code !== 0) {
          last = stderr.trim() || `curl exit ${code}`;
          continue;
        }
        const raw = JSON.parse(await fs.readFile(tmpJson, "utf8")) as {
          status?: string;
          url?: string;
          tunnel?: string | string[];
          filename?: string;
          error?: { code?: string };
          text?: string;
        };
        const tunnel = Array.isArray(raw.tunnel) ? raw.tunnel[0] : raw.tunnel;
        const videoUrl = raw.url || tunnel;
        if (!videoUrl) {
          const codeStr = raw.error?.code || raw.text || `status ${raw.status}`;
          last = codeStr;
          // Don't keep hammering JWT-gated hosts without a key
          if (
            String(codeStr).includes("jwt") ||
            String(codeStr).includes("auth")
          ) {
            break;
          }
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

/** Generic “paste URL → get mp4” helpers used by many free download sites. */
async function resolveViaAjaxSearch(
  endpoint: string,
  mediaUrl: string,
  fallbackTitle: string,
  referer: string,
): Promise<{ title: string; videoUrl: string }> {
  const body = `q=${encodeURIComponent(mediaUrl)}&t=media&lang=en`;
  const raw = await curlJson(endpoint, {
    method: "POST",
    body,
    referer,
    headers: [
      "Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With: XMLHttpRequest",
    ],
  });
  const videoUrl = pickMp4Url(raw);
  if (!videoUrl) {
    throw new Error(`No video in ${new URL(endpoint).hostname}`);
  }
  return { title: fallbackTitle, videoUrl };
}

async function resolveViaInstaSaveSites(
  instagramUrl: string,
): Promise<{ title: string; videoUrl: string }> {
  const clean = normalizeInstagramUrl(instagramUrl);
  const attempts: Array<{
    name: string;
    fn: () => Promise<{ title: string; videoUrl: string }>;
  }> = [
    {
      name: "saveig",
      fn: () =>
        resolveViaAjaxSearch(
          "https://v3.saveig.app/api/ajaxSearch",
          clean,
          "Instagram video",
          "https://saveig.app/",
        ),
    },
    {
      name: "snapinsta",
      fn: () =>
        resolveViaAjaxSearch(
          "https://snapinsta.to/api/ajaxSearch",
          clean,
          "Instagram video",
          "https://snapinsta.to/",
        ),
    },
    {
      name: "igram",
      fn: async () => {
        const raw = await curlJson("https://api.igram.world/api/convert", {
          method: "POST",
          body: JSON.stringify({ url: clean }),
          headers: ["Content-Type: application/json"],
          referer: "https://igram.world/",
        });
        const videoUrl = pickMp4Url(raw);
        if (!videoUrl) throw new Error("igram: no video");
        return { title: "Instagram video", videoUrl };
      },
    },
    {
      name: "fastdl",
      fn: async () => {
        const raw = await curlJson("https://fastdl.app/api/convert", {
          method: "POST",
          body: JSON.stringify({ url: clean }),
          headers: ["Content-Type: application/json"],
          referer: "https://fastdl.app/",
        });
        const videoUrl = pickMp4Url(raw);
        if (!videoUrl) throw new Error("fastdl: no video");
        return { title: "Instagram video", videoUrl };
      },
    },
  ];

  const errors: string[] = [];
  for (const { name, fn } of attempts) {
    try {
      return await fn();
    } catch (err) {
      errors.push(
        `${name}: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`,
      );
    }
  }
  throw new Error(errors.join(" | ") || "instagram helpers failed");
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
 * Instagram Reels / posts — try scrapers, then optional Cobalt with API key.
 */
export async function downloadInstagramHd(
  instagramUrl: string,
  outPath: string,
): Promise<{ title: string }> {
  await ensureCurl();
  const clean = normalizeInstagramUrl(instagramUrl);

  const errors: string[] = [];
  const resolvers: Array<{
    name: string;
    fn: () => Promise<{ title: string; videoUrl: string }>;
  }> = [
    { name: "helpers", fn: () => resolveViaInstaSaveSites(clean) },
    {
      name: "cobalt",
      fn: () => resolveViaCobalt(clean, "Instagram video"),
    },
  ];

  for (const { name, fn } of resolvers) {
    try {
      const { title, videoUrl } = await fn();
      await curlDownloadFile(videoUrl, outPath, "https://www.instagram.com/");
      return { title: title || "Instagram video" };
    } catch (err) {
      errors.push(
        `${name}: ${err instanceof Error ? err.message : String(err)}`.slice(
          0,
          220,
        ),
      );
    }
  }

  throw new Error(
    `Could not pull Instagram HD automatically (${errors.join(" | ")}).`,
  );
}

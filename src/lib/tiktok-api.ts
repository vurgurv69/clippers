import fs from "fs";
import fsPromises from "fs/promises";
import http from "http";
import https from "https";
import path from "path";
import { spawn } from "child_process";
import { URL } from "url";
import dns from "dns";
import { ytDlpPath } from "@/lib/binaries";

/** Prefer IPv4 — Windows curl/IPv6 often resets on TikTok / helper hosts. */
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // older Node
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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

type HttpOpts = {
  referer?: string;
  method?: "GET" | "POST";
  body?: string;
  headers?: string[];
  timeoutMs?: number;
};

function headerObject(opts: HttpOpts): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
  };
  if (opts.referer) h.Referer = opts.referer;
  for (const line of opts.headers || []) {
    const i = line.indexOf(":");
    if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return h;
}

/** Node fetch — works when Windows curl.exe TLS/resets against helpers. */
async function nodeJson(url: string, opts: HttpOpts = {}): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: headerObject(opts),
    body: opts.method === "POST" ? opts.body : undefined,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON: ${text.slice(0, 160)}`);
  }
}

async function curlJson(url: string, opts: HttpOpts = {}): Promise<unknown> {
  const args = [
    "-4",
    "-sS",
    "-L",
    "--max-time",
    String(Math.ceil((opts.timeoutMs ?? 45_000) / 1000)),
    "-A",
    UA,
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

/** Prefer Node; fall back to curl. */
async function httpJson(url: string, opts: HttpOpts = {}): Promise<unknown> {
  const errors: string[] = [];
  try {
    return await nodeJson(url, opts);
  } catch (err) {
    errors.push(`node: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return await curlJson(url, opts);
  } catch (err) {
    errors.push(`curl: ${err instanceof Error ? err.message : String(err)}`);
  }
  throw new Error(errors.join(" | "));
}

function nodeGetFollow(
  url: string,
  referer: string,
  redirects = 0,
): Promise<{ status: number; stream: NodeJS.ReadableStream; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error("Too many redirects"));
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error("Bad URL"));
      return;
    }
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.get(
      url,
      {
        family: 4,
        timeout: 180_000,
        headers: {
          "User-Agent": UA,
          Referer: referer,
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(nodeGetFollow(next, referer, redirects + 1));
          return;
        }
        if (code >= 400) {
          res.resume();
          reject(new Error(`HTTP ${code}`));
          return;
        }
        resolve({ status: code, stream: res, headers: res.headers });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Node download timeout"));
    });
    req.on("error", reject);
  });
}

async function nodeDownloadFile(url: string, outPath: string, referer: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.part`;
  await fsPromises.unlink(tmp).catch(() => undefined);

  // fetch() works well for proxy hosts (tikcdn.io); https+IPv4 for the rest.
  if (/tikcdn\.io|ssstik|cobalt/i.test(url)) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: referer,
        Accept: "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 40_000) {
      throw new Error(`Downloaded file was too small (${buf.length} bytes)`);
    }
    await fsPromises.writeFile(tmp, buf);
  } else {
    const { stream } = await nodeGetFollow(url, referer);
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(tmp);
      stream.pipe(ws);
      ws.on("finish", () => resolve());
      ws.on("error", reject);
      stream.on("error", reject);
    });
  }

  const stat = await fsPromises.stat(tmp);
  if (stat.size < 40_000) {
    await fsPromises.unlink(tmp).catch(() => undefined);
    throw new Error(`Downloaded file was too small (${stat.size} bytes)`);
  }
  await fsPromises.unlink(outPath).catch(() => undefined);
  await fsPromises.rename(tmp, outPath);
}

async function curlDownloadFile(url: string, outPath: string, referer: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.part`;
  const args = [
    "-4",
    "-sS",
    "-L",
    "--max-time",
    "240",
    "-A",
    UA,
    "-H",
    `Referer: ${referer}`,
    "-o",
    tmp,
    url,
  ];
  const { code, stderr } = await runCurl(args);
  if (code !== 0) {
    await fsPromises.unlink(tmp).catch(() => undefined);
    throw new Error(stderr.trim() || `curl download exit ${code}`);
  }
  const stat = await fsPromises.stat(tmp);
  if (stat.size < 40_000) {
    await fsPromises.unlink(tmp).catch(() => undefined);
    throw new Error("Downloaded file was too small");
  }
  await fsPromises.unlink(outPath).catch(() => undefined);
  await fsPromises.rename(tmp, outPath);
}

/** yt-dlp as a generic URL downloader (skips TikTok webpage / curl_cffi). */
async function ytdlpDownloadFile(url: string, outPath: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(outPath), { recursive: true });
  const dir = path.dirname(outPath);
  const stamp = `ttcdn-${Date.now()}`;
  const template = path.join(dir, `${stamp}.%(ext)s`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ytDlpPath(),
      [
        "--no-warnings",
        "--no-playlist",
        "--force-ipv4",
        "-f",
        "b/best",
        "--force-overwrites",
        "-o",
        template,
        "--",
        url,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().slice(0, 220) || `yt-dlp exit ${code}`));
    });
  });

  const files = (await fsPromises.readdir(dir)).filter((f) => f.startsWith(`${stamp}.`));
  if (!files.length) throw new Error("yt-dlp produced no file");
  const full = path.join(dir, files[0]);
  const stat = await fsPromises.stat(full);
  if (stat.size < 40_000) {
    await fsPromises.unlink(full).catch(() => undefined);
    throw new Error("yt-dlp file too small");
  }
  await fsPromises.unlink(outPath).catch(() => undefined);
  await fsPromises.rename(full, outPath);
}

async function httpDownloadFile(url: string, outPath: string, referer: string): Promise<void> {
  const errors: string[] = [];
  for (const [name, fn] of [
    ["node", () => nodeDownloadFile(url, outPath, referer)],
    ["curl", () => curlDownloadFile(url, outPath, referer)],
    ["ytdlp-url", () => ytdlpDownloadFile(url, outPath)],
  ] as const) {
    try {
      await fn();
      return;
    } catch (err) {
      errors.push(`${name}: ${(err instanceof Error ? err.message : String(err)).slice(0, 140)}`);
    }
  }
  throw new Error(errors.join(" | "));
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
    if (/^https?:\/\//i.test(s) && (/\.mp4(\?|$)/i.test(s) || /mime_type=video/i.test(s))) {
      return s;
    }
    if (/^https?:\/\//i.test(s) && /tiktokcdn|byteoversea|musicaldown|snaptik|tikwm/i.test(s)) {
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
      "download_url",
      "download",
      "video",
      "url",
      "nwm_video_url",
      "nwm_video_url_HQ",
      "playAddr",
      "downloadAddr",
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
      const raw = (await httpJson(endpoint, {
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

/**
 * sssTik → tikcdn.io proxy. Avoids direct TikTok CDN / Windows curl resets.
 * Returns the “without watermark” link when present.
 */
async function resolveViaSsstik(
  tiktokUrl: string,
): Promise<{ title: string; videoUrl: string }> {
  const clean = normalizeTikTokUrl(tiktokUrl);
  const html = await (async () => {
    const res = await fetch("https://ssstik.io/abc?url=dl", {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "*/*",
        Referer: "https://ssstik.io/en",
        Origin: "https://ssstik.io",
        "HX-Request": "true",
        "HX-Target": "target",
        "HX-Current-URL": "https://ssstik.io/en",
      },
      body: `id=${encodeURIComponent(clean)}&locale=en&tt=0`,
      signal: AbortSignal.timeout(45_000),
      redirect: "follow",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ssstik HTTP ${res.status}`);
    return text;
  })();

  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => m[1]);
  // Prefer direct tikcdn video id links (no-wm), then other tikcdn / download URLs.
  const ranked = [...new Set(hrefs)].sort((a, b) => {
    const score = (u: string) => {
      let s = 0;
      if (/tikcdn\.io\/ssstik\/\d+/i.test(u)) s += 50;
      if (/tikcdn\.io/i.test(u)) s += 20;
      if (/without|hd|mp4/i.test(u)) s += 10;
      if (/\/m\//i.test(u)) s -= 5; // music
      return s;
    };
    return score(b) - score(a);
  });
  const videoUrl = ranked.find((u) => /tikcdn\.io|ssstik|download/i.test(u));
  if (!videoUrl) throw new Error("ssstik: no download link in response");

  const titleMatch = html.match(/<p[^>]*class="maintext"[^>]*>([^<]+)/i);
  const title = (titleMatch?.[1] || "TikTok video").trim();
  return { title, videoUrl };
}

/** Alternate helper used by many free TT download sites. */
async function resolveViaTikTokDownloaderApis(
  tiktokUrl: string,
): Promise<{ title: string; videoUrl: string }> {
  const clean = normalizeTikTokUrl(tiktokUrl);
  const attempts: Array<() => Promise<{ title: string; videoUrl: string }>> = [
    async () => {
      const raw = await httpJson(
        `https://www.tiktokdownloadu.com/api/ajaxSearch?lang=en`,
        {
          method: "POST",
          body: `q=${encodeURIComponent(clean)}&t=media&lang=en`,
          headers: [
            "Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With: XMLHttpRequest",
          ],
          referer: "https://www.tiktokdownloadu.com/",
        },
      );
      const videoUrl = pickMp4Url(raw);
      if (!videoUrl) throw new Error("tiktokdownloadu: no video");
      return { title: "TikTok video", videoUrl };
    },
  ];

  const errors: string[] = [];
  for (const fn of attempts) {
    try {
      return await fn();
    } catch (err) {
      errors.push((err instanceof Error ? err.message : String(err)).slice(0, 100));
    }
  }
  throw new Error(errors.join(" | ") || "alt helpers failed");
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
    try {
      for (const quality of ["max", "1080", "720"] as const) {
        const body = JSON.stringify({
          url: clean,
          videoQuality: quality,
          downloadMode: "auto",
          filenameStyle: "basic",
        });
        const headers: string[] = [
          "Content-Type: application/json",
          "Accept: application/json",
        ];
        if (apiKey) {
          const scheme = apiKey.includes(".") ? "Bearer" : "Api-Key";
          headers.push(`Authorization: ${scheme} ${apiKey}`);
        }
        const raw = (await httpJson(host, {
          method: "POST",
          body,
          headers,
        })) as {
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
          last = String(codeStr);
          if (last.includes("jwt") || last.includes("auth")) break;
          continue;
        }
        return {
          title: (raw.filename || fallbackTitle).replace(/\.[^.]+$/, ""),
          videoUrl,
        };
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
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
  const raw = await httpJson(endpoint, {
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
        const raw = await httpJson("https://api.igram.world/api/convert", {
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
        const raw = await httpJson("https://fastdl.app/api/convert", {
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

/**
 * HD TikTok without watermark (helper APIs — you stay on Clippers).
 * Uses Node HTTP first because Windows curl.exe often resets on these hosts.
 */
export async function downloadTikTokNoWatermark(
  tiktokUrl: string,
  outPath: string,
): Promise<{ title: string }> {
  const errors: string[] = [];
  const resolvers: Array<{
    name: string;
    fn: () => Promise<{ title: string; videoUrl: string }>;
    referer: string;
  }> = [
    // Proxy CDN first — reliable when TikTok CDN / Windows curl resets.
    {
      name: "ssstik",
      fn: () => resolveViaSsstik(tiktokUrl),
      referer: "https://ssstik.io/",
    },
    {
      name: "tikwm",
      fn: () => resolveViaTikWm(tiktokUrl),
      referer: "https://www.tiktok.com/",
    },
    {
      name: "alt",
      fn: () => resolveViaTikTokDownloaderApis(tiktokUrl),
      referer: "https://www.tiktok.com/",
    },
    {
      name: "cobalt",
      fn: () => resolveViaCobalt(tiktokUrl, "TikTok video"),
      referer: "https://www.tiktok.com/",
    },
  ];

  for (const { name, fn, referer } of resolvers) {
    try {
      const { title, videoUrl } = await fn();
      await httpDownloadFile(videoUrl, outPath, referer);
      return { title: title || "TikTok video" };
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
      await httpDownloadFile(videoUrl, outPath, "https://www.instagram.com/");
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

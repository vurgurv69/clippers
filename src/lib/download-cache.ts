/**
 * Local download cache — reuse previously pulled videos by URL hash.
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_ROOT = path.join(process.cwd(), ".data", "download-cache");

export function urlCacheKey(url: string) {
  return crypto.createHash("sha1").update(url.trim()).digest("hex").slice(0, 24);
}

export function cacheDirForUrl(url: string) {
  return path.join(CACHE_ROOT, urlCacheKey(url));
}

export async function readCachedDownload(
  url: string,
): Promise<{ videoPath: string; title: string; duration: number } | null> {
  try {
    const dir = cacheDirForUrl(url);
    const metaPath = path.join(dir, "meta.json");
    const videoPath = path.join(dir, "source.mp4");
    const raw = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(raw) as {
      title?: string;
      duration?: number;
      createdAt?: string;
    };
    const st = await fs.stat(videoPath);
    if (st.size < 50_000) return null;
    // Cache valid for 7 days
    const age = Date.now() - new Date(meta.createdAt || 0).getTime();
    if (age > 7 * 24 * 3600_000) return null;
    return {
      videoPath,
      title: meta.title || "Cached video",
      duration: meta.duration || 0,
    };
  } catch {
    return null;
  }
}

export async function writeCachedDownload(opts: {
  url: string;
  sourcePath: string;
  title: string;
  duration: number;
}) {
  try {
    const dir = cacheDirForUrl(opts.url);
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, "source.mp4");
    await fs.copyFile(opts.sourcePath, dest);
    await fs.writeFile(
      path.join(dir, "meta.json"),
      JSON.stringify(
        {
          url: opts.url,
          title: opts.title,
          duration: opts.duration,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // cache is best-effort
  }
}

export async function listDownloadCache(): Promise<
  Array<{ key: string; title: string; duration: number; createdAt: string }>
> {
  try {
    await fs.mkdir(CACHE_ROOT, { recursive: true });
    const keys = await fs.readdir(CACHE_ROOT);
    const rows = [];
    for (const key of keys.slice(0, 40)) {
      try {
        const meta = JSON.parse(
          await fs.readFile(path.join(CACHE_ROOT, key, "meta.json"), "utf8"),
        ) as { title?: string; duration?: number; createdAt?: string };
        rows.push({
          key,
          title: meta.title || key,
          duration: meta.duration || 0,
          createdAt: meta.createdAt || "",
        });
      } catch {
        // skip
      }
    }
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

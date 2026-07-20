/**
 * OAuth token store + YouTube upload helpers (Phase 3).
 * Tokens live under .data/oauth/ — never exposed to the client.
 */

import fs from "fs/promises";
import path from "path";
import type { OAuthConnection, PublishPlatform } from "./platform-types";

const DATA_ROOT = path.join(process.cwd(), ".data");

function oauthRoot() {
  return path.join(DATA_ROOT, "oauth");
}

function tokenPath(platform: PublishPlatform) {
  return path.join(oauthRoot(), `${platform}.json`);
}

export type StoredTokens = {
  platform: PublishPlatform;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountName?: string;
  accountId?: string;
  scope?: string;
  connectedAt: string;
};

export function oauthConfigured(platform: PublishPlatform): boolean {
  if (platform === "youtube") {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
    );
  }
  if (platform === "tiktok") {
    return Boolean(
      process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim(),
    );
  }
  // Other platforms: same pattern when env vars exist
  const map: Record<string, [string, string]> = {
    instagram: ["META_APP_ID", "META_APP_SECRET"],
    linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  };
  const keys = map[platform];
  if (!keys) return false;
  return Boolean(process.env[keys[0]]?.trim() && process.env[keys[1]]?.trim());
}

export async function loadTokens(
  platform: PublishPlatform,
): Promise<StoredTokens | null> {
  try {
    const raw = await fs.readFile(tokenPath(platform), "utf8");
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens) {
  await fs.mkdir(oauthRoot(), { recursive: true });
  await fs.writeFile(tokenPath(tokens.platform), JSON.stringify(tokens, null, 2), "utf8");
}

export async function clearTokens(platform: PublishPlatform) {
  try {
    await fs.unlink(tokenPath(platform));
  } catch {
    // ignore
  }
}

export async function listConnections(): Promise<OAuthConnection[]> {
  const platforms: PublishPlatform[] = [
    "youtube",
    "tiktok",
    "instagram",
    "linkedin",
    "x",
  ];
  const out: OAuthConnection[] = [];
  for (const platform of platforms) {
    const tokens = await loadTokens(platform);
    out.push({
      platform,
      connected: Boolean(tokens?.accessToken),
      accountName: tokens?.accountName,
      accountId: tokens?.accountId,
      connectedAt: tokens?.connectedAt,
      hasTokens: Boolean(tokens?.accessToken),
    });
  }
  return out;
}

export function appBaseUrl(requestUrl?: string): string {
  if (process.env.APP_BASE_URL?.trim()) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (requestUrl) {
    try {
      const u = new URL(requestUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      // fall through
    }
  }
  return "http://localhost:3000";
}

/** Google OAuth authorize URL for YouTube upload scope. */
export function youtubeAuthUrl(state: string, requestUrl?: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const redirect = `${appBaseUrl(requestUrl)}/api/oauth/youtube/callback`;
  const scope = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ].join(" ");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeYoutubeCode(
  code: string,
  requestUrl?: string,
): Promise<StoredTokens> {
  const redirect = `${appBaseUrl(requestUrl)}/api/oauth/youtube/callback`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`YouTube token exchange failed: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  let accountName = "YouTube";
  let accountId = "";
  try {
    const ch = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${data.access_token}` } },
    );
    if (ch.ok) {
      const body = (await ch.json()) as {
        items?: { id?: string; snippet?: { title?: string } }[];
      };
      accountId = body.items?.[0]?.id || "";
      accountName = body.items?.[0]?.snippet?.title || accountName;
    }
  } catch {
    // ignore
  }

  const tokens: StoredTokens = {
    platform: "youtube",
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
    accountName,
    accountId,
    scope: data.scope,
    connectedAt: new Date().toISOString(),
  };
  await saveTokens(tokens);
  return tokens;
}

export async function refreshYoutubeIfNeeded(
  tokens: StoredTokens,
): Promise<StoredTokens> {
  if (!tokens.refreshToken) return tokens;
  if (tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000) return tokens;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      refresh_token: tokens.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return tokens;
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const next = {
    ...tokens,
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : tokens.expiresAt,
  };
  await saveTokens(next);
  return next;
}

/**
 * Resumable upload to YouTube (simple single-request for files under ~256MB).
 * Returns video id.
 */
export async function uploadYoutubeVideo(opts: {
  filePath: string;
  title: string;
  description?: string;
  privacy?: "public" | "unlisted" | "private";
  /** YouTube snippet.tags (no #). */
  tags?: string[];
}): Promise<{ id: string; url: string }> {
  let tokens = await loadTokens("youtube");
  if (!tokens) throw new Error("YouTube not connected");
  tokens = await refreshYoutubeIfNeeded(tokens);

  const tags = (opts.tags || [])
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 15);

  const meta = {
    snippet: {
      title: opts.title.slice(0, 100),
      description: (opts.description || "").slice(0, 5000),
      categoryId: "22",
      ...(tags.length ? { tags } : {}),
    },
    status: {
      privacyStatus: opts.privacy || "unlisted",
      selfDeclaredMadeForKids: false,
    },
  };

  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/*",
      },
      body: JSON.stringify(meta),
    },
  );
  if (!init.ok) {
    const t = await init.text();
    throw new Error(`YouTube init upload failed: ${t.slice(0, 240)}`);
  }
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("No YouTube upload URL");

  const buf = await fs.readFile(opts.filePath);
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/*",
      "Content-Length": String(buf.length),
    },
    body: buf,
  });
  if (!put.ok) {
    const t = await put.text();
    throw new Error(`YouTube upload failed: ${t.slice(0, 240)}`);
  }
  const body = (await put.json()) as { id?: string };
  if (!body.id) throw new Error("YouTube upload missing video id");
  return {
    id: body.id,
    url: `https://youtu.be/${body.id}`,
  };
}

/** Set custom thumbnail on an uploaded YouTube video (PNG/JPG). */
export async function setYoutubeThumbnail(opts: {
  videoId: string;
  imagePath: string;
}): Promise<void> {
  let tokens = await loadTokens("youtube");
  if (!tokens) throw new Error("YouTube not connected");
  tokens = await refreshYoutubeIfNeeded(tokens);

  const buf = await fs.readFile(opts.imagePath);
  const ext = path.extname(opts.imagePath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : "application/octet-stream";

  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(opts.videoId)}&uploadType=media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": contentType,
        "Content-Length": String(buf.length),
      },
      body: buf,
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`YouTube thumbnail failed: ${t.slice(0, 240)}`);
  }
}

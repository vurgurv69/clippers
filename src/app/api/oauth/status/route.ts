import { NextResponse } from "next/server";
import {
  clearTokens,
  listConnections,
  oauthConfigured,
  youtubeAuthUrl,
} from "@/lib/oauth";
import type { PublishPlatform } from "@/lib/platform-types";

export const runtime = "nodejs";

/** GET /api/oauth/status — connection state for all platforms. */
export async function GET() {
  try {
    const connections = await listConnections();
    return NextResponse.json({
      connections: connections.map((c) => ({
        ...c,
        configured: oauthConfigured(c.platform),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/oauth/status?platform=youtube — disconnect. */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform") as PublishPlatform | null;
    if (!platform) {
      return NextResponse.json({ error: "platform required" }, { status: 400 });
    }
    await clearTokens(platform);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Disconnect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/oauth/status { platform } — start OAuth (returns authorize URL). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { platform?: PublishPlatform };
    const platform = body.platform || "youtube";

    if (!oauthConfigured(platform)) {
      return NextResponse.json(
        {
          error: `${platform} OAuth not configured`,
          hint:
            platform === "youtube"
              ? "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local"
              : `Set ${platform.toUpperCase()} credentials in .env.local`,
        },
        { status: 400 },
      );
    }

    if (platform === "youtube") {
      const state = crypto.randomUUID();
      const url = youtubeAuthUrl(state, request.url);
      return NextResponse.json({ url, state, platform });
    }

    // Non-YouTube: use Growth Hub “Get pack” (download + caption) — no OAuth yet
    return NextResponse.json({
      ok: false,
      packMode: true,
      platform,
      configured: oauthConfigured(platform),
      hint: `Use Get pack for ${platform} — native OAuth upload is not wired yet`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth start failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

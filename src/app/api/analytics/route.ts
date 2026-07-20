import { NextResponse } from "next/server";
import { ingestAnalytics, summarizeAnalytics } from "@/lib/analytics-store";

export const runtime = "nodejs";

/** GET /api/analytics?projectId= — summary dashboard. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const summary = await summarizeAnalytics(projectId || undefined);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analytics failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/analytics — ingest live metrics.
 * Body: { platform, projectId?, postId?, views, likes, comments, shares, ... }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      platform?: string;
      projectId?: string;
      postId?: string;
      views?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      watchTimeSec?: number;
      retentionPct?: number;
      source?: "ingest" | "oauth" | "manual";
    };
    if (!body.platform) {
      return NextResponse.json({ error: "platform required" }, { status: 400 });
    }
    const event = await ingestAnalytics({
      platform: body.platform,
      projectId: body.projectId,
      postId: body.postId,
      views: body.views ?? 0,
      likes: body.likes ?? 0,
      comments: body.comments ?? 0,
      shares: body.shares ?? 0,
      watchTimeSec: body.watchTimeSec,
      retentionPct: body.retentionPct,
      source: body.source || "ingest",
    });
    return NextResponse.json({ event });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

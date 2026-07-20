import { NextResponse } from "next/server";
import { loadTokens, refreshYoutubeIfNeeded } from "@/lib/oauth";
import { ingestAnalytics, summarizeAnalytics } from "@/lib/analytics-store";

export const runtime = "nodejs";

/**
 * POST /api/analytics/youtube/pull
 * Pull stats for recent channel uploads (requires YouTube OAuth).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
      maxResults?: number;
    };

    let tokens = await loadTokens("youtube");
    if (!tokens) {
      return NextResponse.json(
        { error: "YouTube not connected" },
        { status: 401 },
      );
    }
    tokens = await refreshYoutubeIfNeeded(tokens);

    const search = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&forMine=true&type=video&order=date&maxResults=${Math.min(15, body.maxResults || 8)}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    if (!search.ok) {
      const t = await search.text();
      return NextResponse.json(
        { error: `YouTube search failed: ${t.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const searchBody = (await search.json()) as {
      items?: { id?: { videoId?: string } }[];
    };
    const ids = (searchBody.items || [])
      .map((i) => i.id?.videoId)
      .filter(Boolean) as string[];

    if (!ids.length) {
      return NextResponse.json({
        pulled: 0,
        summary: await summarizeAnalytics(body.projectId),
      });
    }

    const statsRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${ids.join(",")}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    if (!statsRes.ok) {
      const t = await statsRes.text();
      return NextResponse.json(
        { error: `YouTube stats failed: ${t.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const statsBody = (await statsRes.json()) as {
      items?: {
        id?: string;
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
        snippet?: { title?: string };
      }[];
    };

    let pulled = 0;
    for (const item of statsBody.items || []) {
      if (!item.id) continue;
      const views = Number(item.statistics?.viewCount || 0);
      const likes = Number(item.statistics?.likeCount || 0);
      const comments = Number(item.statistics?.commentCount || 0);
      // Engagement proxy for retention when Analytics API scope isn't connected (Phase 29).
      const engagement =
        views > 0 ? (likes + comments * 2) / views : 0;
      const retentionPct = Math.min(
        92,
        Math.max(18, Math.round(28 + engagement * 180)),
      );
      await ingestAnalytics({
        platform: "youtube",
        projectId: body.projectId,
        postId: item.id,
        views,
        likes,
        comments,
        shares: 0,
        retentionPct,
        source: "oauth",
      });
      pulled++;
    }

    return NextResponse.json({
      pulled,
      titles: (statsBody.items || []).map((i) => i.snippet?.title).filter(Boolean),
      summary: await summarizeAnalytics(body.projectId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pull failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

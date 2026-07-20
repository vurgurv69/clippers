import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import { analyzeHeuristics, buildGrowthPack } from "@/lib/ai-analyze";
import type { ViralScorecard } from "@/lib/growth-types";

export const runtime = "nodejs";

type Body = {
  projectId?: string;
  duration?: number;
  videoTitle?: string;
  transcriptSnippet?: string;
  score?: ViralScorecard;
};

/**
 * POST /api/ai/suggest — Growth Hub publish pack (titles, hashtags, thumbs).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    let duration = Number(body.duration) || 0;
    let videoTitle = body.videoTitle || "Clip";
    let snippet = body.transcriptSnippet || "";

    if (body.projectId) {
      const project = await getProject(body.projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      videoTitle = project.name || videoTitle;
      if (!duration && project.spec?.clips?.length) {
        duration = project.spec.clips.reduce((s, c) => {
          const len = Math.max(0, (c.outPoint - c.inPoint) / (c.speed || 1));
          return s + len;
        }, 0);
      }
      if (!snippet && project.spec?.texts?.length) {
        snippet = project.spec.texts.map((t) => t.text).filter(Boolean).join(" ");
      }
    }

    if (!duration || duration < 0.5) duration = 30;
    if (!snippet) snippet = videoTitle;

    const score =
      body.score ||
      analyzeHeuristics({
        duration,
        videoTitle,
        transcriptText: snippet,
        hasCaptions: true,
      }).score;

    const { pack, usedLlm } = await buildGrowthPack({
      duration,
      videoTitle,
      transcriptSnippet: snippet,
      score,
    });

    return NextResponse.json({ pack, usedLlm });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suggest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

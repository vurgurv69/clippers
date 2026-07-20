import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import { loadCachedTranscript } from "@/lib/media-activity";
import { searchTranscriptSemantic } from "@/lib/semantic-search";
import { searchTranscript } from "@/lib/transcript-search";
import type { TranscriptSegment } from "@/lib/types";

export const runtime = "nodejs";

type Body = {
  projectId?: string;
  assetId?: string;
  query?: string;
  segments?: TranscriptSegment[];
  /** keyword (default) | semantic — meaning-based when LLM available */
  mode?: "keyword" | "semantic";
};

/** POST /api/ai/search — find transcript moments and return seek times. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const query = (body.query || "").trim();
    if (!query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const mode = body.mode === "semantic" ? "semantic" : "keyword";
    let segments = body.segments;
    let assetTags: string[] = [];

    if (body.projectId) {
      const project = await getProject(body.projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      const asset =
        (body.assetId
          ? project.assets.find((a) => a.id === body.assetId)
          : null) ||
        project.assets.find((a) => a.kind === "video");
      if (asset) {
        assetTags = asset.tags || [];
        if (!segments?.length) {
          const cached = await loadCachedTranscript(project.id, asset.id);
          if (cached) segments = cached.segments;
        }
      }
    }

    if (!segments?.length) {
      return NextResponse.json({
        hits: [],
        mode,
        message: "No transcript yet — open Transcript tab and transcribe first.",
      });
    }

    if (mode === "semantic") {
      const { hits, usedLlm, mode: resolvedMode } = await searchTranscriptSemantic(
        segments,
        query,
        assetTags,
      );
      return NextResponse.json({
        hits,
        count: hits.length,
        mode: "semantic",
        usedLlm,
        resolvedMode,
      });
    }

    const hits = searchTranscript(segments, query);
    return NextResponse.json({ hits, count: hits.length, mode: "keyword", usedLlm: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

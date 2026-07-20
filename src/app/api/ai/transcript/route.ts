import fs from "fs/promises";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import {
  assetMediaPath,
  loadCachedTranscript,
  saveCachedTranscript,
} from "@/lib/media-activity";
import { transcribeVideo } from "@/lib/transcribe";
import type { TranscriptSegment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  projectId?: string;
  assetId?: string;
  /** Force Whisper even if cache exists. */
  force?: boolean;
};

/** POST /api/ai/transcript — load or generate Whisper transcript for Studio. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const project = await getProject(body.projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const asset =
      (body.assetId
        ? project.assets.find((a) => a.id === body.assetId)
        : null) || project.assets.find((a) => a.kind === "video");
    if (!asset) {
      return NextResponse.json({ error: "No video asset" }, { status: 400 });
    }

    if (!body.force) {
      const cached = await loadCachedTranscript(project.id, asset.id);
      if (cached) {
        return NextResponse.json({
          segments: cached.segments,
          text: cached.text,
          cached: true,
          assetId: asset.id,
        });
      }
    }

    const media = assetMediaPath(project.id, asset.filename);
    await fs.access(media);
    const { ensureDataDirs, jobDir } = await import("@/lib/jobs");
    await ensureDataDirs();
    await fs.mkdir(jobDir(`editor-${project.id}`), { recursive: true });
    const result = await transcribeVideo(`editor-${project.id}`, media);
    const segments: TranscriptSegment[] = result.segments;
    await saveCachedTranscript(project.id, asset.id, segments);
    const text = segments.map((s) => s.text).join(" ");

    return NextResponse.json({
      segments,
      text,
      cached: false,
      assetId: asset.id,
      language: result.language,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcript failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/ai/transcript?projectId=&assetId= — cache only. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || "";
    const assetId = url.searchParams.get("assetId") || "";
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const asset =
      (assetId ? project.assets.find((a) => a.id === assetId) : null) ||
      project.assets.find((a) => a.kind === "video");
    if (!asset) {
      return NextResponse.json({ segments: [], text: "", cached: false });
    }
    const cached = await loadCachedTranscript(projectId, asset.id);
    if (!cached) {
      return NextResponse.json({
        segments: [],
        text: "",
        cached: false,
        assetId: asset.id,
      });
    }
    return NextResponse.json({
      segments: cached.segments,
      text: cached.text,
      cached: true,
      assetId: asset.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

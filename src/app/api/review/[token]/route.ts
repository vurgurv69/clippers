import { NextResponse } from "next/server";
import {
  addReviewComment,
  getProjectByShareToken,
  latestExportFile,
} from "@/lib/editor-project";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/** GET /api/review/:token — read-only project snapshot for review. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const project = await getProjectByShareToken(token);
    if (!project) {
      return NextResponse.json({ error: "Review link not found" }, { status: 404 });
    }

    const video =
      project.assets.find((a) => a.kind === "video") ||
      project.assets.find((a) => a.kind === "image");

    const latest = await latestExportFile(project.id);
    const previewUrl = latest
      ? `/api/editor/project/${project.id}/file/${encodeURIComponent(latest.filename)}`
      : video
        ? `/api/editor/project/${project.id}/asset/${encodeURIComponent(video.filename)}`
        : null;

    return NextResponse.json({
      name: project.name || "Untitled",
      aspect: project.aspect,
      comments: project.comments || [],
      duration:
        project.spec?.clips?.reduce((s, c) => {
          return s + Math.max(0, (c.outPoint - c.inPoint) / (c.speed || 1));
        }, 0) ||
        video?.duration ||
        0,
      previewUrl,
      previewSource: latest ? "export" : video ? "asset" : null,
      projectId: project.id,
      markers: project.spec?.markers || [],
      readOnly: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/review/:token — add a comment { t, text, author }. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const project = await getProjectByShareToken(token);
    if (!project) {
      return NextResponse.json({ error: "Review link not found" }, { status: 404 });
    }
    const body = (await request.json()) as {
      t?: number;
      text?: string;
      author?: string;
    };
    if (!body.text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const next = await addReviewComment(project.id, {
      t: Number(body.t) || 0,
      text: body.text,
      author: body.author || "Reviewer",
    });
    return NextResponse.json({ comments: next.comments || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { ensureShareToken, getProject } from "@/lib/editor-project";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST — create / return share link for read-only review. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const next = await ensureShareToken(id);
    const token = next.shareToken!;
    return NextResponse.json({
      token,
      url: `/review/${token}`,
      comments: next.comments || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Share failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET — current share status. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({
      token: project.shareToken || null,
      url: project.shareToken ? `/review/${project.shareToken}` : null,
      comments: project.comments || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

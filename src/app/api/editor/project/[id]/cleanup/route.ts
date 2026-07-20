import { NextResponse } from "next/server";
import { deleteUnusedAssets, getProject } from "@/lib/editor-project";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** DELETE unused media assets not referenced by the saved timeline. */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const { project: next, removed } = await deleteUnusedAssets(id);
    return NextResponse.json({ project: next, removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

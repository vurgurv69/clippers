import { NextResponse } from "next/server";
import { getProject, renameAsset } from "@/lib/editor-project";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Load a project (for recovery / reopen). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Rename an asset: { assetId, name }. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { assetId?: string; name?: string };
    if (!body.assetId || typeof body.name !== "string") {
      return NextResponse.json({ error: "assetId and name required" }, { status: 400 });
    }
    const project = await renameAsset(id, body.assetId, body.name);
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rename failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

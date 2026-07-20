import { NextResponse } from "next/server";
import { getProject, saveSpec } from "@/lib/editor-project";
import type { ProjectSpec } from "@/lib/editor-types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Persist timeline state for autosave / crash recovery. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = (await request.json()) as { spec?: ProjectSpec; name?: string };
    if (!body?.spec || !Array.isArray(body.spec.clips)) {
      return NextResponse.json({ error: "Invalid project spec" }, { status: 400 });
    }

    const updated = await saveSpec(id, body.spec, body.name);
    return NextResponse.json({
      ok: true,
      updatedAt: updated.updatedAt,
      name: updated.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

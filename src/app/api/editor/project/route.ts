import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/editor-project";
import type { AspectRatio } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ASPECTS: AspectRatio[] = ["9:16", "1:1", "4:5", "16:9"];

/** List recent projects for the media / recovery launcher. */
export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name || "Untitled",
        aspect: p.aspect,
        assetCount: p.assets.length,
        hasSpec: Boolean(p.spec),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let aspect: AspectRatio = "9:16";
    try {
      const body = (await request.json()) as { aspect?: string };
      if (ASPECTS.includes(body.aspect as AspectRatio)) {
        aspect = body.aspect as AspectRatio;
      }
    } catch {
      // empty body is fine — use default aspect
    }
    const project = await createProject(aspect);
    return NextResponse.json({ project });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

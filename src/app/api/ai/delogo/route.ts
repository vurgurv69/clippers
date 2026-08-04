import fs from "fs/promises";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import { assetMediaPath } from "@/lib/media-activity";
import { detectStableWatermarks } from "@/lib/watermark-detect";

export const runtime = "nodejs";
export const maxDuration = 180;

type Body = {
  projectId?: string;
  assetId?: string;
  inPoint?: number;
  duration?: number;
  samples?: number;
};

/** POST /api/ai/delogo — find stable burned-in names/logos and return cover boxes. */
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
        : null) || project.assets.find((a) => a.kind === "video" || a.kind === "image");
    if (!asset || (asset.kind !== "video" && asset.kind !== "image")) {
      return NextResponse.json({ error: "Video or image asset required" }, { status: 400 });
    }

    const media = assetMediaPath(project.id, asset.filename);
    await fs.access(media);

    const duration = Math.max(
      0.8,
      Number(body.duration) || (asset.kind === "image" ? 2 : asset.duration) || 6,
    );
    const inPoint = Math.max(0, Number(body.inPoint) || 0);

    const result = await detectStableWatermarks({
      jobId: `editor-${project.id}-wm`,
      videoPath: media,
      inPoint,
      duration: asset.kind === "image" ? 1 : duration,
      samples: asset.kind === "image" ? 2 : Number(body.samples) || 5,
    });

    if (!result.boxes.length) {
      return NextResponse.json(
        { error: result.reason || "No watermarks found", ...result },
        { status: 422 },
      );
    }

    return NextResponse.json({
      boxes: result.boxes,
      method: result.method,
      samples: result.samples,
      labels: result.labels,
      reason: result.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Watermark detect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

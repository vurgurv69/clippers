import fs from "fs/promises";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/editor-project";
import { assetMediaPath } from "@/lib/media-activity";
import { suggestReframeTransform } from "@/lib/layout";

export const runtime = "nodejs";
export const maxDuration = 180;

type Body = {
  projectId?: string;
  assetId?: string;
  atSec?: number;
  /** Sample multiple points across duration. */
  track?: boolean;
  /** When true with track, return per-sample keyframe points (Phase 28). Default true. */
  keyframes?: boolean;
  duration?: number;
  /** Source in-point (seconds) — samples stay inside the clip trim window. */
  inPoint?: number;
  samples?: number;
};

/** POST /api/ai/reframe — detect face/person and return clip transform. */
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
    if (!asset || asset.kind !== "video") {
      return NextResponse.json({ error: "Video asset required" }, { status: 400 });
    }

    const media = assetMediaPath(project.id, asset.filename);
    await fs.access(media);
    const duration = Math.max(
      1,
      Number(body.duration) || asset.duration || 8,
    );
    const inPoint = Math.max(0, Number(body.inPoint) || 0);

    if (body.track) {
      const n = Math.min(9, Math.max(3, Number(body.samples) || 7));
      const points: {
        t: number;
        atSec: number;
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        faceFound: boolean;
      }[] = [];

      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const atSec = inPoint + duration * t;
        try {
          const r = await suggestReframeTransform({
            jobId: `editor-${project.id}-t${i}`,
            videoPath: media,
            atSec,
          });
          points.push({
            t,
            atSec,
            x: r.x,
            y: r.y,
            scaleX: r.scaleX,
            scaleY: r.scaleY,
            faceFound: r.faceFound,
          });
        } catch {
          // skip failed sample
        }
      }
      const faced = points.filter((s) => s.faceFound);
      const use = faced.length ? faced : points;
      if (!use.length) {
        return NextResponse.json({ error: "No track samples" }, { status: 422 });
      }
      const avg = (k: "x" | "y" | "scaleX" | "scaleY") =>
        use.reduce((s, r) => s + r[k], 0) / use.length;
      const transform = {
        x: avg("x"),
        y: avg("y"),
        scaleX: avg("scaleX"),
        scaleY: avg("scaleY"),
      };

      const trackPoints =
        body.keyframes !== false
          ? (faced.length >= 2 ? faced : points).map((p) => ({
              t: p.t,
              x: p.x,
              y: p.y,
              scaleX: p.scaleX,
              scaleY: p.scaleY,
              faceFound: p.faceFound,
            }))
          : undefined;

      return NextResponse.json({
        transform,
        reason: `Tracked ${use.length} frames${faced.length ? ` (${faced.length} with face)` : ""}${
          trackPoints && trackPoints.length > 1 ? " → keyframes" : ""
        }`,
        faceFound: faced.length > 0,
        samples: use.length,
        tracked: true,
        trackPoints,
      });
    }

    const atSec = Math.max(0, Number(body.atSec) || inPoint);
    const result = await suggestReframeTransform({
      jobId: `editor-${project.id}`,
      videoPath: media,
      atSec,
    });

    return NextResponse.json({
      transform: {
        x: result.x,
        y: result.y,
        scaleX: result.scaleX,
        scaleY: result.scaleY,
      },
      reason: result.reason,
      faceFound: result.faceFound,
      tracked: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reframe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { assetsDir, cacheDir, exportsDir, getProject } from "@/lib/editor-project";
import { assetMediaPath } from "@/lib/media-activity";
import { suggestReframeTransform } from "@/lib/layout";
import {
  buildFaceBiasedVf,
  buildHeadlineDrawtext,
  faceCenterFromTransform,
  layoutFaceCenter,
  parseThumbnailLayout,
  type ThumbnailLayoutPreset,
} from "@/lib/thumbnail-layout";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  projectId?: string;
  assetId?: string;
  /** Source time in seconds. */
  t?: number;
  /** Overlay headline. */
  headline?: string;
  width?: number;
  height?: number;
  /** Optional brand colors for headline burn (Phase 5). */
  primary?: string;
  accent?: string;
  /** Layout preset: left-face | right-text | bold-center */
  layout?: ThumbnailLayoutPreset | string;
};

async function detectFaceCenter(
  projectId: string,
  mediaPath: string,
  atSec: number,
): Promise<{ cx: number; cy: number; faceFound: boolean } | null> {
  if (!fs.existsSync(mediaPath)) return null;
  try {
    const result = await suggestReframeTransform({
      jobId: `thumb-${projectId}-${Date.now()}`,
      videoPath: mediaPath,
      atSec,
    });
    const { cx, cy } = faceCenterFromTransform(result.x, result.y);
    return { cx, cy, faceFound: result.faceFound };
  } catch {
    return null;
  }
}

/**
 * POST /api/ai/thumbnail — grab a frame and burn optional headline → PNG.
 * Query: ?layout=left-face|right-text|bold-center
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
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
        : null) ||
      project.assets.find((a) => a.kind === "video" || a.kind === "image");
    if (!asset) {
      return NextResponse.json({ error: "No media asset" }, { status: 400 });
    }

    const src = path.join(assetsDir(project.id), asset.filename);
    if (!fs.existsSync(src)) {
      return NextResponse.json({ error: "File missing" }, { status: 404 });
    }

    const t = Math.max(0, Number(body.t) || 0);
    const w = Math.min(1920, Math.max(640, Number(body.width) || 1080));
    const h = Math.min(1920, Math.max(640, Number(body.height) || 1920));
    const headline = (body.headline || "").trim().slice(0, 48);
    const layout = parseThumbnailLayout(body.layout || url.searchParams.get("layout"));

    const dir = cacheDir(project.id);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.mkdir(exportsDir(project.id), { recursive: true });

    const baseName = `thumb_export_${asset.id}_${Math.round(t * 10)}_${layout}_${Date.now()}`;
    const jpgPath = path.join(dir, `${baseName}.jpg`);
    const outPath = path.join(exportsDir(project.id), `${baseName}.png`);

    let faceDetected: { cx: number; cy: number; faceFound: boolean } | null = null;
    if (asset.kind === "video") {
      const media = assetMediaPath(project.id, asset.filename);
      faceDetected = await detectFaceCenter(project.id, media, t);
    }

    const { cx, cy } = layoutFaceCenter(
      layout,
      faceDetected ? { cx: faceDetected.cx, cy: faceDetected.cy } : null,
    );
    const vfBase = buildFaceBiasedVf(w, h, cx, cy);

    if (asset.kind === "image") {
      await runCommand(ffmpegPath(), [
        "-y",
        "-i",
        src,
        "-vf",
        vfBase,
        "-frames:v",
        "1",
        jpgPath,
      ]);
    } else {
      await runCommand(ffmpegPath(), [
        "-y",
        "-ss",
        t.toFixed(2),
        "-i",
        src,
        "-vf",
        vfBase,
        "-frames:v",
        "1",
        jpgPath,
      ]);
    }

    if (headline) {
      const draw = buildHeadlineDrawtext(headline, w, layout, body.primary, body.accent);
      await runCommand(ffmpegPath(), [
        "-y",
        "-i",
        jpgPath,
        "-vf",
        draw,
        outPath,
      ]);
    } else {
      await runCommand(ffmpegPath(), ["-y", "-i", jpgPath, outPath]);
    }

    const fileUrl = `/api/editor/project/${project.id}/file/${encodeURIComponent(path.basename(outPath))}`;
    return NextResponse.json({
      url: fileUrl,
      filename: path.basename(outPath),
      headline: headline || null,
      layout,
      faceBiased: Boolean(faceDetected?.faceFound),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Thumbnail export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { assetsDir, getProject, setAssetProxy } from "@/lib/editor-project";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Generate a low-res H.264 proxy for snappy Studio preview.
 * Export always uses the original `asset.filename`.
 *   POST { assetId } → { project, proxyFile }
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { assetId?: string };
    if (!body.assetId) {
      return NextResponse.json({ error: "assetId required" }, { status: 400 });
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const asset = project.assets.find((a) => a.id === body.assetId);
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    if (asset.kind !== "video" && asset.kind !== "image") {
      return NextResponse.json({ error: "Proxies are for video/image only" }, { status: 400 });
    }

    const dir = assetsDir(id);
    const src = path.join(dir, asset.filename);
    if (!fs.existsSync(src)) {
      return NextResponse.json({ error: "Source file missing" }, { status: 404 });
    }

    const proxyName = `proxy_${path.parse(asset.filename).name}.mp4`;
    const outPath = path.join(dir, proxyName);
    await fsp.mkdir(dir, { recursive: true });

    if (asset.kind === "image") {
      await runCommand(ffmpegPath(), [
        "-y",
        "-loop",
        "1",
        "-t",
        "2",
        "-i",
        src,
        "-vf",
        "scale=1280:-2:force_original_aspect_ratio=decrease",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-an",
        outPath,
      ]);
    } else {
      await runCommand(ffmpegPath(), [
        "-y",
        "-i",
        src,
        "-vf",
        "scale=1280:-2:force_original_aspect_ratio=decrease",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        outPath,
      ]);
    }

    const updated = await setAssetProxy(id, asset.id, proxyName);
    return NextResponse.json({ project: updated, proxyFile: proxyName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

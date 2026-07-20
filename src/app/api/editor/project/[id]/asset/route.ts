import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ffprobePath, runCommand } from "@/lib/binaries";
import {
  addAsset,
  assetsDir,
  deleteAsset,
  getProject,
  replaceAssetFile,
} from "@/lib/editor-project";
import { smartTagsForAsset } from "@/lib/smart-tags";
import type { AssetKind, ProjectAsset } from "@/lib/editor-types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg"]);
const LUT_EXT = new Set([".cube"]);
const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function kindFor(ext: string): AssetKind | null {
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (LUT_EXT.has(ext)) return "lut";
  if (FONT_EXT.has(ext)) return "font";
  return null;
}

async function probe(filePath: string) {
  const { stdout } = await runCommand(ffprobePath(), [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height:format=duration",
    "-of",
    "json",
    filePath,
  ]);
  const data = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const streams = data.streams || [];
  const video = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  return {
    width: video?.width,
    height: video?.height,
    hasAudio,
    duration: Number.parseFloat(data.format?.duration || "0") || 0,
  };
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > 800 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max ~800MB)." }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    const kind = kindFor(ext);
    if (!kind) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext || "unknown"}` },
        { status: 400 },
      );
    }

    await fs.mkdir(assetsDir(id), { recursive: true });
    const replaceId = String(form.get("replaceId") || "");
    const assetId = replaceId || crypto.randomUUID();
    const filename = `${assetId}${ext}`;
    const dest = path.join(assetsDir(id), filename);
    await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));

    if (kind === "lut" || kind === "font") {
      const asset: ProjectAsset = {
        id: assetId,
        kind,
        name: file.name,
        filename,
        duration: 0,
        hasAudio: false,
      };
      if (replaceId) {
        const nextProject = await replaceAssetFile(id, replaceId, {
          filename,
          name: file.name,
          duration: 0,
          hasAudio: false,
        });
        const updated = nextProject.assets.find((a) => a.id === replaceId) || asset;
        return NextResponse.json({ asset: updated, project: nextProject });
      }
      await addAsset(id, asset);
      return NextResponse.json({ asset });
    }

    const info = await probe(dest);
    const meta = {
      filename,
      name: file.name,
      width: info.width,
      height: info.height,
      duration: info.duration,
      hasAudio: info.hasAudio,
    };

    if (replaceId) {
      const existing = project.assets.find((a) => a.id === replaceId);
      if (!existing) {
        return NextResponse.json({ error: "Asset to replace not found" }, { status: 404 });
      }
      if (existing.kind !== kind) {
        return NextResponse.json(
          { error: `Replace must use same kind (${existing.kind})` },
          { status: 400 },
        );
      }
      const nextProject = await replaceAssetFile(id, replaceId, meta);
      const asset = nextProject.assets.find((a) => a.id === replaceId)!;
      return NextResponse.json({ asset, project: nextProject });
    }

    const asset: ProjectAsset = {
      id: assetId,
      kind,
      ...meta,
      tags: smartTagsForAsset({
        kind,
        name: file.name,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        hasAudio: meta.hasAudio,
      }),
    };

    await addAsset(id, asset);

    // Mirror into project.spec.smartAssetTags for Growth Hub / later phases
    try {
      const p = await getProject(id);
      if (p) {
        p.spec = p.spec || { aspect: p.aspect, clips: [] };
        p.spec.smartAssetTags = {
          ...(p.spec.smartAssetTags || {}),
          [asset.id]: asset.tags || [],
        };
        const { saveProject } = await import("@/lib/editor-project");
        await saveProject(p);
      }
    } catch {
      // non-fatal
    }

    return NextResponse.json({ asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    if (!assetId) {
      return NextResponse.json({ error: "assetId required" }, { status: 400 });
    }
    const next = await deleteAsset(id, assetId);
    return NextResponse.json({ project: next });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

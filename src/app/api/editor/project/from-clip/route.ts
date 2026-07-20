import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ffprobePath, runCommand } from "@/lib/binaries";
import {
  addAsset,
  assetsDir,
  createProject,
  getProject,
  saveSpec,
} from "@/lib/editor-project";
import { defaultClip, DEFAULT_COLOR, DEFAULT_TRANSFORM } from "@/lib/editor-types";
import type { AspectRatio } from "@/lib/types";
import { getJob, jobDir } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

async function probeMeta(filePath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}> {
  try {
    const { stdout } = await runCommand(ffprobePath(), [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    const data = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: {
        codec_type?: string;
        width?: number;
        height?: number;
      }[];
    };
    const v = data.streams?.find((s) => s.codec_type === "video");
    const a = data.streams?.find((s) => s.codec_type === "audio");
    return {
      duration: Math.max(0.1, Number(data.format?.duration) || 1),
      width: v?.width || 1080,
      height: v?.height || 1920,
      hasAudio: Boolean(a),
    };
  } catch {
    return { duration: 30, width: 1080, height: 1920, hasAudio: true };
  }
}

function aspectFromSize(w: number, h: number): AspectRatio {
  const r = w / Math.max(1, h);
  if (r > 1.4) return "16:9";
  if (r > 0.9 && r < 1.1) return "1:1";
  if (r > 0.75 && r < 0.9) return "4:5";
  return "9:16";
}

/**
 * POST /api/editor/project/from-clip
 * Copy an AI-clipped MP4 into a new Studio project (Phase 30 handoff).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      clipId?: string;
      name?: string;
    };
    if (!body.jobId || !body.clipId) {
      return NextResponse.json(
        { error: "jobId and clipId required" },
        { status: 400 },
      );
    }

    const job = await getJob(body.jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const clip = job.clips.find((c) => c.id === body.clipId);
    if (!clip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    const src = path.join(jobDir(body.jobId), "clips", `${body.clipId}.mp4`);
    try {
      await fs.access(src);
    } catch {
      return NextResponse.json({ error: "Clip file missing" }, { status: 404 });
    }

    const meta = await probeMeta(src);
    const aspect = aspectFromSize(meta.width, meta.height);
    const project = await createProject(aspect);
    const projectName = (body.name || clip.title || "From clip").slice(0, 80);

    const assetId = crypto.randomUUID();
    const filename = `${assetId}.mp4`;
    await fs.copyFile(src, path.join(assetsDir(project.id), filename));

    const asset = {
      id: assetId,
      kind: "video" as const,
      name: clip.title || "Clip",
      filename,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      hasAudio: meta.hasAudio,
      tags: ["from-clip", "ai-clip"],
    };
    await addAsset(project.id, asset);

    const tl = defaultClip(asset, crypto.randomUUID());
    tl.color = { ...DEFAULT_COLOR };
    tl.transform = { ...DEFAULT_TRANSFORM };
    tl.outPoint = meta.duration;

    await saveSpec(
      project.id,
      {
        aspect,
        clips: [tl],
        texts: [],
        musicTracks: [],
        markers: [],
      },
      projectName,
    );

    const fresh = await getProject(project.id);
    return NextResponse.json({
      project: fresh,
      message: "Opened in Studio",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handoff failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

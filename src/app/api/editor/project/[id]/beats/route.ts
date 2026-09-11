import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { apiGate } from "@/lib/api-gate";
import { computeRmsWindows } from "@/lib/audio-energy";
import { detectBeatsFromRms, estimateBpm } from "@/lib/beat-detect";
import { getProject, projectDir, workDir } from "@/lib/editor-project";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { assertSafeResourceId, PathSafetyError, safeBasename } from "@/lib/safe-id";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/**
 * POST { assetId?, sensitivity? } → extract mono WAV, detect beat onsets.
 * Places are returned as times; client adds TimelineMarkers.
 */
export async function POST(request: Request, { params }: Params) {
  const gated = apiGate(request, {
    bucket: "beat-detect",
    capacity: 8,
    refillPerSec: 0.15,
    cost: 2,
  });
  if (gated) return gated;

  try {
    const { id } = await params;
    assertSafeResourceId(id, "projectId");
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      assetId?: string;
      filename?: string;
      sensitivity?: number;
    };
    const sensitivity = Math.max(0.1, Math.min(1, Number(body.sensitivity) || 0.55));

    let mediaName: string | null = null;
    if (body.filename) {
      mediaName = safeBasename(body.filename);
    } else if (body.assetId) {
      const asset = project.assets.find((a) => a.id === body.assetId);
      if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
      mediaName = safeBasename(asset.filename);
    } else {
      const first = project.assets.find((a) => a.kind === "video" || a.kind === "audio");
      if (!first) {
        return NextResponse.json({ error: "No audio/video asset to analyze" }, { status: 400 });
      }
      mediaName = safeBasename(first.filename);
    }

    const src = path.join(projectDir(id), "assets", mediaName);
    try {
      await fs.access(src);
    } catch {
      return NextResponse.json({ error: "Media file missing" }, { status: 404 });
    }

    const wavPath = path.join(workDir(id), `beats-${Date.now()}.wav`);
    await fs.mkdir(workDir(id), { recursive: true });
    await runCommand(ffmpegPath(), [
      "-y",
      "-i",
      src,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      wavPath,
    ]);

    const windows = await computeRmsWindows(wavPath, 0.05);
    const beats = detectBeatsFromRms(windows, sensitivity);
    const bpm = estimateBpm(beats);

    try {
      await fs.unlink(wavPath);
    } catch {
      // ignore
    }

    return NextResponse.json({
      beats: beats.map((b) => ({ t: Number(b.t.toFixed(3)), strength: b.strength })),
      bpm,
      count: beats.length,
    });
  } catch (err) {
    if (err instanceof PathSafetyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Beat detection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

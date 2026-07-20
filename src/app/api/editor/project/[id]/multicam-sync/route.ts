import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { assetsDir, getProject, workDir } from "@/lib/editor-project";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** Read up to `seconds` of mono float32 PCM @ 8 kHz from a media file. */
async function extractPcm(
  src: string,
  outPath: string,
  seconds = 12,
): Promise<Float32Array> {
  await runCommand(ffmpegPath(), [
    "-y",
    "-i",
    src,
    "-t",
    String(seconds),
    "-ac",
    "1",
    "-ar",
    "8000",
    "-f",
    "f32le",
    outPath,
  ]);
  const buf = await fsp.readFile(outPath);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

/** Best lag (seconds) to shift `b` relative to `a` via normalized cross-correlation. */
function bestOffsetSeconds(a: Float32Array, b: Float32Array, sampleRate = 8000): number {
  const n = Math.min(a.length, b.length);
  if (n < sampleRate) return 0;
  const maxLag = Math.min(Math.floor(sampleRate * 4), Math.floor(n / 4)); // ±4s
  let bestLag = 0;
  let bestScore = -Infinity;

  // Energy of a (reference window)
  let aEnergy = 0;
  for (let i = 0; i < n; i++) aEnergy += a[i] * a[i];
  if (aEnergy < 1e-8) return 0;

  for (let lag = -maxLag; lag <= maxLag; lag += 4) {
    let sum = 0;
    let bEnergy = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const j = i + lag;
      if (j < 0 || j >= n) continue;
      sum += a[i] * b[j];
      bEnergy += b[j] * b[j];
      count++;
    }
    if (count < sampleRate || bEnergy < 1e-8) continue;
    const score = sum / Math.sqrt(aEnergy * bEnergy);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  // Positive lag means b is behind a → add to b's inPoint to catch up
  return bestLag / sampleRate;
}

/**
 * Waveform-align multicam angles to the master (live) clip.
 * POST { masterClipId, angleClipIds: string[] }
 * → { offsets: Record<clipId, seconds> }
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      masterAssetFile?: string;
      angleAssetFiles?: Array<{ clipId: string; filename: string }>;
    };
    if (!body.masterAssetFile || !body.angleAssetFiles?.length) {
      return NextResponse.json(
        { error: "masterAssetFile and angleAssetFiles required" },
        { status: 400 },
      );
    }

    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const dir = workDir(id);
    await fsp.mkdir(dir, { recursive: true });
    const masterSrc = path.join(assetsDir(id), path.basename(body.masterAssetFile));
    if (!fs.existsSync(masterSrc)) {
      return NextResponse.json({ error: "Master media missing" }, { status: 404 });
    }

    const masterPcmPath = path.join(dir, `mc-master-${Date.now()}.f32`);
    const masterPcm = await extractPcm(masterSrc, masterPcmPath);
    const offsets: Record<string, number> = {};

    for (const angle of body.angleAssetFiles) {
      const src = path.join(assetsDir(id), path.basename(angle.filename));
      if (!fs.existsSync(src)) {
        offsets[angle.clipId] = 0;
        continue;
      }
      const pcmPath = path.join(dir, `mc-ang-${angle.clipId}.f32`);
      try {
        const pcm = await extractPcm(src, pcmPath);
        offsets[angle.clipId] = bestOffsetSeconds(masterPcm, pcm);
      } catch {
        offsets[angle.clipId] = 0;
      } finally {
        try {
          await fsp.unlink(pcmPath);
        } catch {
          // ignore
        }
      }
    }

    try {
      await fsp.unlink(masterPcmPath);
    } catch {
      // ignore
    }

    return NextResponse.json({ offsets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Multicam sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

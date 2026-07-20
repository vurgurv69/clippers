import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { assetsDir, cacheDir, getProject } from "@/lib/editor-project";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string; name: string }> };

/**
 * Renders a transparent PNG waveform for an audio asset (or a video with
 * audio) using ffmpeg's showwavespic filter. Cached on disk.
 *   GET /api/editor/project/:id/waveform/:name?w=600&h=60
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id, name } = await params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const safe = path.basename(name);
    const asset = project.assets.find((a) => a.filename === safe);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    if (!asset.hasAudio && asset.kind !== "audio") {
      return NextResponse.json({ error: "No audio track" }, { status: 400 });
    }

    const src = path.join(assetsDir(id), safe);
    if (!fs.existsSync(src)) return NextResponse.json({ error: "File missing" }, { status: 404 });

    const url = new URL(request.url);
    const w = Math.min(2400, Math.max(120, Number(url.searchParams.get("w") || "600") || 600));
    const h = Math.min(200, Math.max(24, Number(url.searchParams.get("h") || "60") || 60));

    const dir = cacheDir(id);
    await fsp.mkdir(dir, { recursive: true });
    const outName = `wave_${safe}_${w}x${h}.png`;
    const outPath = path.join(dir, outName);

    if (!fs.existsSync(outPath)) {
      await runCommand(ffmpegPath(), [
        "-y",
        "-i",
        src,
        "-filter_complex",
        `aformat=channel_layouts=mono,compand,showwavespic=s=${w}x${h}:colors=#059669`,
        "-frames:v",
        "1",
        outPath,
      ]);
    }

    const buf = fs.readFileSync(outPath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Waveform failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

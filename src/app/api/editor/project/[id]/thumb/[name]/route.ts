import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { assetsDir, cacheDir, getProject } from "@/lib/editor-project";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string; name: string }> };

/**
 * Extracts a single JPEG frame from a video asset at time `t` (seconds).
 * Frames are cached on disk so the timeline filmstrip is cheap to redraw.
 *   GET /api/editor/project/:id/thumb/:name?t=1.5&w=160
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id, name } = await params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const safe = path.basename(name);
    const asset = project.assets.find((a) => a.filename === safe);
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const src = path.join(assetsDir(id), safe);
    if (!fs.existsSync(src)) return NextResponse.json({ error: "File missing" }, { status: 404 });

    const url = new URL(request.url);
    const t = Math.max(0, Number(url.searchParams.get("t") || "0") || 0);
    const w = Math.min(320, Math.max(48, Number(url.searchParams.get("w") || "160") || 160));
    const tKey = Math.round(t * 2) / 2; // 0.5s cache granularity

    const dir = cacheDir(id);
    await fsp.mkdir(dir, { recursive: true });
    const outName = `thumb_${safe}_${tKey}_${w}.jpg`;
    const outPath = path.join(dir, outName);

    if (!fs.existsSync(outPath)) {
      if (asset.kind === "image") {
        await runCommand(ffmpegPath(), [
          "-y",
          "-i",
          src,
          "-vf",
          `scale=${w}:-1`,
          "-frames:v",
          "1",
          outPath,
        ]);
      } else {
        await runCommand(ffmpegPath(), [
          "-y",
          "-ss",
          tKey.toFixed(2),
          "-i",
          src,
          "-vf",
          `scale=${w}:-1`,
          "-frames:v",
          "1",
          outPath,
        ]);
      }
    }

    const buf = fs.readFileSync(outPath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Thumbnail failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { addAsset, assetsDir, getProject } from "@/lib/editor-project";
import type { ProjectAsset } from "@/lib/editor-types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Local generated music/SFX beds (Phase 30) — no external CDN. */
const BEDS: Record<
  string,
  { label: string; kind: "music" | "sfx"; tags: string[]; lavfi: string; dur: number }
> = {
  "bed-soft": {
    label: "Soft pad",
    kind: "music",
    tags: ["music-bed", "library", "soft"],
    lavfi:
      "sine=f=220:d=8,volume=0.12[a0];sine=f=277:d=8,volume=0.08[a1];[a0][a1]amix=inputs=2:duration=first,afade=t=in:d=1,afade=t=out:st=6.5:d=1.5",
    dur: 8,
  },
  "bed-pulse": {
    label: "Pulse bed",
    kind: "music",
    tags: ["music-bed", "library", "pulse"],
    lavfi:
      "sine=f=110:d=8,volume=0.15,afreqshift=shift=0,tremolo=f=2:d=0.4,afade=t=in:d=0.4,afade=t=out:st=7:d=1",
    dur: 8,
  },
  "bed-warm": {
    label: "Warm drone",
    kind: "music",
    tags: ["music-bed", "library", "warm"],
    lavfi:
      "sine=f=98:d=10,volume=0.14[a0];sine=f=147:d=10,volume=0.07[a1];[a0][a1]amix=inputs=2,afade=t=in:d=1.2,afade=t=out:st=8.5:d=1.5",
    dur: 10,
  },
  "bed-tech": {
    label: "Tech tick",
    kind: "music",
    tags: ["music-bed", "library", "tech"],
    lavfi:
      "sine=f=440:d=8,volume=0.05,tremolo=f=8:d=0.55,afade=t=in:d=0.2,afade=t=out:st=7:d=1",
    dur: 8,
  },
  "sfx-whoosh": {
    label: "Whoosh",
    kind: "sfx",
    tags: ["sfx", "library", "whoosh"],
    lavfi:
      "anoisesrc=d=0.6:c=pink:r=44100,volume=0.35,afade=t=in:d=0.05,afade=t=out:st=0.35:d=0.25,highpass=f=800",
    dur: 0.6,
  },
  "sfx-hit": {
    label: "Impact hit",
    kind: "sfx",
    tags: ["sfx", "library", "hit"],
    lavfi:
      "sine=f=80:d=0.35,volume=0.45,afade=t=out:st=0.05:d=0.3,lowpass=f=400",
    dur: 0.35,
  },
  "sfx-pop": {
    label: "Pop click",
    kind: "sfx",
    tags: ["sfx", "library", "pop"],
    lavfi: "sine=f=880:d=0.12,volume=0.3,afade=t=out:st=0.02:d=0.1",
    dur: 0.12,
  },
  "sfx-riser": {
    label: "Short riser",
    kind: "sfx",
    tags: ["sfx", "library", "riser"],
    lavfi:
      "anoisesrc=d=1.2:c=white:r=44100,volume=0.2,afade=t=in:d=1.0,afade=t=out:st=1.0:d=0.2,highpass=f=400",
    dur: 1.2,
  },
};

/** GET — catalog of built-in beds/SFX. */
export async function GET() {
  return NextResponse.json({
    beds: Object.entries(BEDS).map(([id, b]) => ({
      id,
      label: b.label,
      kind: b.kind,
      tags: b.tags,
      duration: b.dur,
    })),
  });
}

type Body = {
  projectId?: string;
  preset?: string;
};

/**
 * POST /api/ai/music — generate a local music bed or SFX into the project.
 */
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
    const key = body.preset && BEDS[body.preset] ? body.preset : "bed-soft";
    const bed = BEDS[key];

    await fs.mkdir(assetsDir(body.projectId), { recursive: true });
    const assetId = crypto.randomUUID();
    const filename = `${assetId}.m4a`;
    const dest = path.join(assetsDir(body.projectId), filename);

    await runCommand(ffmpegPath(), [
      "-y",
      "-f",
      "lavfi",
      "-i",
      bed.lavfi,
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      String(bed.dur),
      dest,
    ]);

    const asset: ProjectAsset = {
      id: assetId,
      kind: "audio",
      name: bed.label,
      filename,
      duration: bed.dur,
      hasAudio: true,
      tags: bed.tags,
    };
    await addAsset(body.projectId, asset);

    return NextResponse.json({
      asset,
      url: `/api/editor/project/${body.projectId}/asset/${encodeURIComponent(filename)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Music generate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { suggestBrollMoments } from "@/lib/ai-analyze";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { addAsset, assetsDir, getProject } from "@/lib/editor-project";
import type { ProjectAsset } from "@/lib/editor-types";
import { clipLength } from "@/lib/editor-types";
import { loadCachedTranscript } from "@/lib/media-activity";
import type { TranscriptSegment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRESETS: Record<
  string,
  {
    label: string;
    color: string;
    text: string;
    w: number;
    h: number;
    /** Stock pack plates (Phase 27). */
    stock?: boolean;
    tags?: string[];
  }
> = {
  gradient: {
    label: "Gradient plate",
    color: "0x0b1f1a",
    text: "B-ROLL",
    w: 1080,
    h: 1920,
  },
  flash: {
    label: "Color flash",
    color: "0x12d6a0",
    text: "",
    w: 1080,
    h: 1920,
  },
  lower: {
    label: "Lower third",
    color: "0x111827",
    text: "LOWER THIRD",
    w: 1080,
    h: 360,
  },
  soft: {
    label: "Soft wash",
    color: "0x1e293b",
    text: "",
    w: 1080,
    h: 1920,
  },
  "stock-nature": {
    label: "Stock · Nature",
    color: "0x1a3d2e",
    text: "NATURE",
    w: 1080,
    h: 1920,
    stock: true,
    tags: ["broll", "stock", "nature"],
  },
  "stock-city": {
    label: "Stock · City",
    color: "0x1e293b",
    text: "CITY",
    w: 1080,
    h: 1920,
    stock: true,
    tags: ["broll", "stock", "city"],
  },
  "stock-tech": {
    label: "Stock · Tech",
    color: "0x0f766e",
    text: "TECH",
    w: 1080,
    h: 1920,
    stock: true,
    tags: ["broll", "stock", "tech"],
  },
  "stock-warm": {
    label: "Stock · Warm light",
    color: "0x92400e",
    text: "WARM",
    w: 1080,
    h: 1920,
    stock: true,
    tags: ["broll", "stock", "warm"],
  },
  "stock-abstract": {
    label: "Stock · Abstract",
    color: "0x334155",
    text: "TEXTURE",
    w: 1080,
    h: 1920,
    stock: true,
    tags: ["broll", "stock", "abstract"],
  },
  "stock-office": {
    label: "Stock · Office",
    color: "0x374151",
    text: "OFFICE",
    w: 1080,
    h: 1920,
    stock: true,
    tags: ["broll", "stock", "office"],
  },
};

/** GET /api/ai/broll — list stock + generate presets. */
export async function GET() {
  const stock = Object.entries(PRESETS)
    .filter(([, p]) => p.stock)
    .map(([id, p]) => ({
      id,
      label: p.label,
      hint: "Local plate → V2",
      tags: p.tags || ["broll", "stock"],
    }));
  return NextResponse.json({ stock, presets: Object.keys(PRESETS) });
}

type Body = {
  projectId?: string;
  preset?: string;
  label?: string;
  color?: string;
  action?: "suggest";
  duration?: number;
};

/**
 * POST /api/ai/broll — generate a simple still image asset for V2 overlay.
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

    if (body.action === "suggest") {
      let duration = Number(body.duration) || 0;
      if (!duration && project.spec?.clips?.length) {
        duration = project.spec.clips.reduce((s, c) => s + clipLength(c), 0);
      }
      const primary = project.assets.find((a) => a.kind === "video");
      if (!duration && primary?.duration) duration = primary.duration;
      duration = Math.max(1, duration || 30);

      let transcriptText = project.spec?.texts?.map((t) => t.text).join(" ").trim();
      let segments: TranscriptSegment[] | undefined;
      if (primary) {
        const cached = await loadCachedTranscript(project.id, primary.id);
        if (cached) {
          transcriptText = transcriptText || cached.text;
          segments = cached.segments;
        }
      }

      const moments = suggestBrollMoments({
        duration,
        aiMarkers: project.spec?.aiMarkers,
        transcriptText,
        segments,
        growthPack: project.spec?.growthPack,
      });

      return NextResponse.json({ moments });
    }

    const key = body.preset && PRESETS[body.preset] ? body.preset : "gradient";
    const preset = PRESETS[key];
    const color =
      body.color && /^#[0-9a-fA-F]{6}$/.test(body.color)
        ? `0x${body.color.slice(1)}`
        : preset.color;
    const label = (body.label || preset.text || preset.label).slice(0, 32);

    await fs.mkdir(assetsDir(body.projectId), { recursive: true });
    const assetId = crypto.randomUUID();
    const filename = `${assetId}.png`;
    const dest = path.join(assetsDir(body.projectId), filename);

    const { w, h } = preset;
    const colorInput = `color=c=${color}:s=${w}x${h}:d=1`;
    const args = ["-y", "-f", "lavfi", "-i", colorInput];
    if (label.trim()) {
      const safe = label
        .replace(/\\/g, "")
        .replace(/:/g, "\\:")
        .replace(/'/g, "")
        .replace(/%/g, "");
      args.push(
        "-vf",
        `drawtext=text='${safe}':fontsize=${Math.round(Math.min(w, h) * 0.08)}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=(h-text_h)/2`,
      );
    }
    args.push("-frames:v", "1", dest);
    await runCommand(ffmpegPath(), args);

    const asset: ProjectAsset = {
      id: assetId,
      kind: "image",
      name: `${preset.label}${label ? ` — ${label}` : ""}`,
      filename,
      width: w,
      height: h,
      duration: 0,
      hasAudio: false,
      tags: preset.tags || ["broll", key],
    };
    await addAsset(body.projectId, asset);

    return NextResponse.json({
      asset,
      url: `/api/editor/project/${body.projectId}/file/${encodeURIComponent(filename)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "B-roll generate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

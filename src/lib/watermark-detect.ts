/**
 * Detect burned-in names / logos that stay fixed across frames
 * (e.g. "flux", © marks, channel watermarks) and return normalized boxes.
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { ffmpegPath, runCommand } from "@/lib/binaries";
import { hasOpenAiKey, llmVision, parseLlmJson } from "@/lib/llm";
import type { DelogoRegion } from "@/lib/editor-types";
import { jobDir } from "@/lib/jobs";

async function grabFrame(videoPath: string, atSec: number, outPath: string) {
  await runCommand(ffmpegPath(), [
    "-y",
    "-ss",
    String(Math.max(0, atSec)),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outPath,
  ]);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function normalizeRegion(r: Partial<DelogoRegion>): DelogoRegion | null {
  const x = clamp01(Number(r.x));
  const y = clamp01(Number(r.y));
  const w = clamp01(Number(r.w));
  const h = clamp01(Number(r.h));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null;
  }
  if (w < 0.02 || h < 0.015) return null;
  if (w > 0.55 || h > 0.4) return null; // ignore huge regions (not a name stamp)
  return {
    x,
    y,
    w,
    h,
    label: typeof r.label === "string" ? r.label.slice(0, 48) : undefined,
  };
}

/** Merge overlapping detections. */
function mergeRegions(regions: DelogoRegion[]): DelogoRegion[] {
  if (regions.length <= 1) return regions;
  const sorted = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: DelogoRegion[] = [];
  for (const r of sorted) {
    const hit = out.find((o) => {
      const ox2 = o.x + o.w;
      const oy2 = o.y + o.h;
      const rx2 = r.x + r.w;
      const ry2 = r.y + r.h;
      const ix = Math.max(0, Math.min(ox2, rx2) - Math.max(o.x, r.x));
      const iy = Math.max(0, Math.min(oy2, ry2) - Math.max(o.y, r.y));
      const inter = ix * iy;
      const union = o.w * o.h + r.w * r.h - inter;
      return union > 0 && inter / union > 0.35;
    });
    if (!hit) {
      out.push(r);
      continue;
    }
    const x1 = Math.min(hit.x, r.x);
    const y1 = Math.min(hit.y, r.y);
    const x2 = Math.max(hit.x + hit.w, r.x + r.w);
    const y2 = Math.max(hit.y + hit.h, r.y + r.h);
    hit.x = x1;
    hit.y = y1;
    hit.w = x2 - x1;
    hit.h = y2 - y1;
    if (r.label && !hit.label) hit.label = r.label;
  }
  return out.slice(0, 6);
}

/**
 * Fallback when no OpenAI key: find border bands that stay nearly identical
 * across frames (typical of fixed name/logo burns).
 */
async function heuristicStableMarks(
  framePaths: string[],
): Promise<DelogoRegion[]> {
  if (framePaths.length < 2) return [];
  const gw = 32;
  const gh = 18;
  const grids: Float32Array[] = [];

  for (const fp of framePaths) {
    const { data, info } = await sharp(fp)
      .resize(gw, gh, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    void info;
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = data[i] / 255;
    grids.push(g);
  }

  const scores = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    let mean = 0;
    for (const g of grids) mean += g[i];
    mean /= grids.length;
    let varSum = 0;
    for (const g of grids) {
      const d = g[i] - mean;
      varSum += d * d;
    }
    const variance = varSum / grids.length;
    // Prefer low variance (stable) but not flat empty black/white
    const detail = mean > 0.08 && mean < 0.92 ? 1 : 0.15;
    scores[i] = detail / (variance + 0.002);
  }

  const regions: DelogoRegion[] = [];
  const border = (cx: number, cy: number) =>
    cx < 0.28 || cx > 0.72 || cy < 0.22 || cy > 0.78;

  // Threshold top cells in border zones
  const cells: { i: number; s: number }[] = [];
  for (let i = 0; i < scores.length; i++) {
    const cx = ((i % gw) + 0.5) / gw;
    const cy = (Math.floor(i / gw) + 0.5) / gh;
    if (!border(cx, cy)) continue;
    cells.push({ i, s: scores[i] });
  }
  cells.sort((a, b) => b.s - a.s);
  const top = cells.slice(0, 12).filter((c) => c.s > cells[0].s * 0.45);
  const used = new Set<number>();

  for (const cell of top) {
    if (used.has(cell.i)) continue;
    // Grow a small blob
    const queue = [cell.i];
    const blob: number[] = [];
    used.add(cell.i);
    while (queue.length && blob.length < 24) {
      const cur = queue.pop()!;
      blob.push(cur);
      const x = cur % gw;
      const y = Math.floor(cur / gw);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (used.has(ni)) continue;
        if (scores[ni] < cell.s * 0.35) continue;
        const cx = (nx + 0.5) / gw;
        const cy = (ny + 0.5) / gh;
        if (!border(cx, cy)) continue;
        used.add(ni);
        queue.push(ni);
      }
    }
    if (blob.length < 2) continue;
    let minX = gw;
    let minY = gh;
    let maxX = 0;
    let maxY = 0;
    for (const i of blob) {
      const x = i % gw;
      const y = Math.floor(i / gw);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const region = normalizeRegion({
      x: minX / gw,
      y: minY / gh,
      w: (maxX - minX + 1) / gw,
      h: (maxY - minY + 1) / gh,
      label: "stable mark",
    });
    if (region) regions.push(region);
  }

  return mergeRegions(regions);
}

async function visionMarks(framePaths: string[]): Promise<{
  regions: DelogoRegion[];
  usedLlm: boolean;
  raw?: string;
}> {
  if (!hasOpenAiKey()) return { regions: [], usedLlm: false };

  const images: string[] = [];
  for (const fp of framePaths.slice(0, 5)) {
    const buf = await fs.readFile(fp);
    images.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
  }

  const system = `You find burned-in watermarks and fixed on-screen names in video frames.
Return ONLY JSON: {"marks":[{"label":"string","x":0,"y":0,"w":0,"h":0}]}
Coords are normalized 0-1 from the top-left of the frame.
Include: brand names, copyright lines, channel names, @handles, logos, "flux"-style stamps, TikTok/IG marks — anything that stays in a FIXED place across frames.
Exclude: dialogue captions, subtitles that change words, faces, main subject.
If nothing fixed is visible, return {"marks":[]}.`;

  const user = `These frames are from the SAME clip at different times.
Find every stable imprinted name / logo / copyright that does not move.
Be tight on boxes but leave a little padding around the text.`;

  const { text, usedLlm } = await llmVision({
    system,
    text: user,
    images,
    maxTokens: 700,
    temperature: 0.05,
  });

  if (!usedLlm || !text) return { regions: [], usedLlm: false, raw: text };

  const parsed = parseLlmJson<{ marks?: Partial<DelogoRegion>[] }>(text);
  const regions = (parsed?.marks || [])
    .map((m) => normalizeRegion(m))
    .filter((m): m is DelogoRegion => Boolean(m));

  return { regions: mergeRegions(regions), usedLlm: true, raw: text };
}

export type WatermarkDetectResult = {
  boxes: DelogoRegion[];
  method: "vision" | "heuristic" | "none";
  samples: number;
  labels: string[];
  reason: string;
};

export async function detectStableWatermarks(opts: {
  jobId: string;
  videoPath: string;
  inPoint?: number;
  duration?: number;
  samples?: number;
}): Promise<WatermarkDetectResult> {
  const inPoint = Math.max(0, opts.inPoint ?? 0);
  const duration = Math.max(0.8, opts.duration ?? 6);
  const n = Math.min(6, Math.max(3, opts.samples ?? 5));
  const dir = path.join(jobDir(opts.jobId), "wm-frames");
  await fs.mkdir(dir, { recursive: true });

  const framePaths: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = inPoint + (duration * (i + 0.5)) / n;
    const out = path.join(dir, `wm-${i}.jpg`);
    try {
      await grabFrame(opts.videoPath, t, out);
      await fs.access(out);
      framePaths.push(out);
    } catch {
      // skip
    }
  }

  if (framePaths.length < 2) {
    return {
      boxes: [],
      method: "none",
      samples: framePaths.length,
      labels: [],
      reason: "Could not sample enough frames",
    };
  }

  /** Grow boxes so thin text stamps are fully covered. */
  const expand = (regions: DelogoRegion[]) =>
    regions.map((r) => {
      const padX = Math.max(0.012, r.w * 0.18);
      const padY = Math.max(0.01, r.h * 0.28);
      const x = clamp01(r.x - padX);
      const y = clamp01(r.y - padY);
      const w = clamp01(Math.min(1 - x, r.w + padX * 2));
      const h = clamp01(Math.min(1 - y, r.h + padY * 2));
      return { ...r, x, y, w, h };
    });

  const vision = await visionMarks(framePaths);
  if (vision.regions.length) {
    const boxes = expand(vision.regions);
    const labels = boxes.map((r) => r.label || "mark").filter(Boolean);
    return {
      boxes,
      method: "vision",
      samples: framePaths.length,
      labels,
      reason: `AI found ${boxes.length} stable mark(s)${
        labels.length ? `: ${labels.slice(0, 4).join(", ")}` : ""
      }`,
    };
  }

  const heuristic = expand(await heuristicStableMarks(framePaths));
  if (heuristic.length) {
    return {
      boxes: heuristic,
      method: "heuristic",
      samples: framePaths.length,
      labels: heuristic.map((r) => r.label || "stable mark"),
      reason: hasOpenAiKey()
        ? `No clear name from AI — covered ${heuristic.length} stable border mark(s)`
        : `No OPENAI_API_KEY — covered ${heuristic.length} stable border mark(s). Set a key for name-aware detection.`,
    };
  }

  return {
    boxes: [],
    method: "none",
    samples: framePaths.length,
    labels: [],
    reason: hasOpenAiKey()
      ? "No stable burned-in names or logos found"
      : "Nothing found. Set OPENAI_API_KEY so AI can read names like “flux”, or pick a corner manually.",
  };
}

import fs from "fs/promises";
import path from "path";
import { ffmpegPath, ffprobePath, runCommand } from "./binaries";
import { jobDir } from "./jobs";
import type { LayoutMode } from "./types";

export type PersonBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  areaRatio: number;
};

export type LayoutDecision = {
  mode: "fill" | "face-top";
  /** Crop box in source pixels for the face/person overlay (face-top only) */
  face?: { x: number; y: number; w: number; h: number };
  reason: string;
};

type DetectorResult = Array<{
  label?: string;
  score?: number;
  box?: { xmin: number; ymin: number; xmax: number; ymax: number };
}>;

let detectorPromise: Promise<
  (input: string, opts?: Record<string, unknown>) => Promise<DetectorResult>
> | null = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      const det = await pipeline("object-detection", "Xenova/yolos-tiny");
      return det as unknown as (
        input: string,
        opts?: Record<string, unknown>,
      ) => Promise<DetectorResult>;
    })();
  }
  return detectorPromise;
}

async function probeSize(videoPath: string) {
  const { stdout } = await runCommand(ffprobePath(), [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    videoPath,
  ]);
  const [w, h] = stdout.trim().split(",").map((n) => Number.parseInt(n, 10));
  return { w: w || 1280, h: h || 720 };
}

async function grabFrame(
  videoPath: string,
  atSec: number,
  outPath: string,
) {
  await runCommand(ffmpegPath(), [
    "-y",
    "-ss",
    String(Math.max(0, atSec)),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outPath,
  ]);
}

function clampBox(
  box: { x: number; y: number; w: number; h: number },
  imgW: number,
  imgH: number,
) {
  let { x, y, w, h } = box;
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  w = Math.max(32, Math.floor(w));
  h = Math.max(32, Math.floor(h));
  if (x + w > imgW) w = imgW - x;
  if (y + h > imgH) h = imgH - y;
  return { x, y, w: Math.max(32, w), h: Math.max(32, h) };
}

/** Expand person box toward a head/face crop for the overlay bubble. */
function faceCropFromPerson(
  box: PersonBox,
  imgW: number,
  imgH: number,
) {
  // Tall person boxes → take upper portion (head/shoulders)
  const useTop = box.h > box.w * 1.25;
  const h = useTop ? Math.max(box.w * 1.15, box.h * 0.55) : box.h * 1.15;
  const w = useTop ? box.w * 1.25 : box.w * 1.2;
  const x = box.x + box.w / 2 - w / 2;
  const y = useTop ? box.y - h * 0.05 : box.y + box.h / 2 - h / 2;
  return clampBox({ x, y, w, h }, imgW, imgH);
}

async function detectPersonOnFrame(
  framePath: string,
  imgW: number,
  imgH: number,
): Promise<PersonBox | null> {
  try {
    const detector = await getDetector();
    const results = await detector(framePath, { threshold: 0.45 });
    const people = (results || [])
      .filter((r) => (r.label || "").toLowerCase() === "person" && r.box)
      .map((r) => {
        const b = r.box!;
        const normalized = b.xmax <= 1.5 && b.ymax <= 1.5;
        const x = normalized ? b.xmin * imgW : b.xmin;
        const y = normalized ? b.ymin * imgH : b.ymin;
        const w = normalized ? (b.xmax - b.xmin) * imgW : b.xmax - b.xmin;
        const h = normalized ? (b.ymax - b.ymin) * imgH : b.ymax - b.ymin;
        return {
          x,
          y,
          w,
          h,
          score: r.score || 0,
          areaRatio: (w * h) / (imgW * imgH),
        } satisfies PersonBox;
      })
      .sort((a, b) => b.areaRatio - a.areaRatio);

    return people[0] || null;
  } catch {
    return null;
  }
}

/**
 * Decide fill vs face-on-top.
 * - Big face/person filling the frame → talking-head, leave as fill (focused crop)
 * - Small person (facecam / streamer) → crop face and pin on top of the game/content
 */
export async function decideLayout(opts: {
  jobId: string;
  videoPath: string;
  clipStart: number;
  clipEnd: number;
  layoutMode: LayoutMode;
}): Promise<LayoutDecision> {
  const { jobId, videoPath, clipStart, clipEnd, layoutMode } = opts;

  if (layoutMode === "fill") {
    return { mode: "fill", reason: "Fill crop (manual)" };
  }

  const { w: imgW, h: imgH } = await probeSize(videoPath);
  const mid = (clipStart + clipEnd) / 2;
  const samples = [
    clipStart + Math.min(4, (clipEnd - clipStart) * 0.15),
    mid,
    clipEnd - Math.min(4, (clipEnd - clipStart) * 0.15),
  ];

  const frameDir = path.join(jobDir(jobId), "frames");
  await fs.mkdir(frameDir, { recursive: true });

  let best: PersonBox | null = null;
  for (let i = 0; i < samples.length; i++) {
    const framePath = path.join(frameDir, `sample-${Date.now()}-${i}.jpg`);
    try {
      await grabFrame(videoPath, samples[i], framePath);
      const person = await detectPersonOnFrame(framePath, imgW, imgH);
      if (person && (!best || person.score * person.areaRatio > best.score * best.areaRatio)) {
        best = person;
      }
    } catch {
      // keep trying other samples
    }
  }

  if (!best) {
    return {
      mode: layoutMode === "face-top" ? "fill" : "fill",
      reason: "No person detected — fill crop",
    };
  }

  // Talking-head / selfie: person dominates the frame → don't overlay
  if (best.areaRatio >= 0.3 && layoutMode !== "face-top") {
    return {
      mode: "fill",
      reason: "Talking head — keep full person framing",
      face: faceCropFromPerson(best, imgW, imgH),
    };
  }

  // Force face-top or small facecam person over gameplay
  if (layoutMode === "face-top" || best.areaRatio < 0.3) {
    return {
      mode: "face-top",
      face: faceCropFromPerson(best, imgW, imgH),
      reason:
        layoutMode === "face-top"
          ? "Face pinned on top (manual)"
          : "Facecam detected — face on top of content",
    };
  }

  return { mode: "fill", reason: "Default fill crop" };
}

/**
 * Build ffmpeg -vf / -filter_complex for the chosen layout (+ optional captions).
 * Returns either a simple -vf string or filter_complex + output label.
 */
export function buildVideoFilters(opts: {
  outW: number;
  outH: number;
  assName?: string;
  layout: LayoutDecision;
  captionsEnabled?: boolean;
}): { vf?: string; filterComplex?: string; mapVideo?: string } {
  const { outW, outH, assName, layout, captionsEnabled } = opts;
  // Default OFF unless explicitly true — safer than accidental burns
  const burnCaptions = captionsEnabled === true && Boolean(assName);
  const base =
    `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;

  if (layout.mode !== "face-top" || !layout.face) {
    return {
      vf: burnCaptions ? `${base},ass=${assName}` : base,
    };
  }

  const { x, y, w, h } = layout.face;
  // Face bubble ~36% of canvas width, sitting near the top
  const faceW = Math.round(outW * 0.36);
  const faceH = Math.round(faceW * 1.15);
  const marginTop = Math.round(outH * 0.04);

  // split → full-frame background + face crop overlay, then optional captions
  const parts = [
    `[0:v]split=2[bg][fg]`,
    `[bg]${base}[base]`,
    `[fg]crop=${w}:${h}:${x}:${y},scale=${faceW}:${faceH}:force_original_aspect_ratio=increase,crop=${faceW}:${faceH},setsar=1[face]`,
    `[base][face]overlay=(W-w)/2:${marginTop}[laid]`,
  ];
  if (burnCaptions) {
    parts.push(`[laid]ass=${assName}[vout]`);
    return { filterComplex: parts.join(";"), mapVideo: "[vout]" };
  }

  return { filterComplex: parts.join(";"), mapVideo: "[laid]" };
}

/**
 * Suggest a Studio clip transform that reframes toward a detected person/face
 * at a given timestamp (Phase 2 AI Reframe).
 */
export async function suggestReframeTransform(opts: {
  jobId: string;
  videoPath: string;
  atSec: number;
}): Promise<{
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  reason: string;
  faceFound: boolean;
}> {
  const { jobId, videoPath, atSec } = opts;
  const { w: imgW, h: imgH } = await probeSize(videoPath);
  const frameDir = path.join(jobDir(jobId), "frames");
  await fs.mkdir(frameDir, { recursive: true });
  const framePath = path.join(frameDir, `reframe-${Date.now()}.jpg`);

  try {
    await grabFrame(videoPath, Math.max(0, atSec), framePath);
    const person = await detectPersonOnFrame(framePath, imgW, imgH);
    if (!person) {
      return {
        x: 0,
        y: 0,
        scaleX: 1.15,
        scaleY: 1.15,
        reason: "No face/person — gentle punch-in",
        faceFound: false,
      };
    }

    const face = faceCropFromPerson(person, imgW, imgH);
    const cx = (face.x + face.w / 2) / imgW; // 0..1
    const cy = (face.y + face.h / 2) / imgH;
    // Map to ClipTransform x/y (-1..1 from center)
    const x = Math.max(-0.85, Math.min(0.85, (0.5 - cx) * 2));
    const y = Math.max(-0.85, Math.min(0.85, (0.5 - cy) * 2));
    // Scale so face fills more of frame
    const cover = Math.max(1.2, Math.min(2.2, 0.55 / Math.max(person.areaRatio, 0.08)));
    return {
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      scaleX: Number(cover.toFixed(3)),
      scaleY: Number(cover.toFixed(3)),
      reason: person.areaRatio < 0.3
        ? "Facecam detected — reframed to face"
        : "Person detected — reframed to subject",
      faceFound: true,
    };
  } catch {
    return {
      x: 0,
      y: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      reason: "Reframe fallback punch-in",
      faceFound: false,
    };
  }
}

/**
 * Smooth face / subject tracking across a clip window.
 * Samples multiple frames and eases crop boxes for face-top overlays.
 */
import fs from "fs/promises";
import path from "path";
import { ffmpegPath, runCommand } from "./binaries";
import { jobDir } from "./jobs";

export type TrackBox = { t: number; x: number; y: number; w: number; h: number };

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpBox(a: TrackBox, b: TrackBox, t: number): TrackBox {
  const e = easeInOut(Math.min(1, Math.max(0, t)));
  return {
    t: lerp(a.t, b.t, e),
    x: lerp(a.x, b.x, e),
    y: lerp(a.y, b.y, e),
    w: lerp(a.w, b.w, e),
    h: lerp(a.h, b.h, e),
  };
}

/** Interpolate keyframes at `atSec` (clip-relative). */
export function sampleTrackAt(keys: TrackBox[], atSec: number): TrackBox | null {
  if (!keys.length) return null;
  if (atSec <= keys[0].t) return keys[0];
  if (atSec >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (atSec >= a.t && atSec <= b.t) {
      const u = (atSec - a.t) / Math.max(0.001, b.t - a.t);
      return lerpBox(a, b, u);
    }
  }
  return keys[keys.length - 1];
}

/**
 * Build smoothed track from sparse detections.
 * Detections should be absolute source coords; t is seconds from clip start.
 */
export function smoothTrack(detections: TrackBox[]): TrackBox[] {
  if (detections.length <= 1) return detections;
  const sorted = [...detections].sort((a, b) => a.t - b.t);
  // Reject jumps > 35% of frame diagonal in one step by clamping
  const out: TrackBox[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    const dx = Math.abs(cur.x + cur.w / 2 - (prev.x + prev.w / 2));
    const dy = Math.abs(cur.y + cur.h / 2 - (prev.y + prev.h / 2));
    const jump = Math.hypot(dx, dy);
    const maxJump = Math.max(cur.w, cur.h) * 0.85;
    if (jump > maxJump) {
      // Ease halfway instead of teleport
      out.push(lerpBox(prev, cur, 0.45));
    }
    out.push(cur);
  }
  return out;
}

export async function grabTrackFrame(
  jobId: string,
  videoPath: string,
  atSec: number,
): Promise<string> {
  const dir = path.join(jobDir(jobId), "frames");
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `track-${atSec.toFixed(2)}.jpg`);
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
    out,
  ]);
  return out;
}

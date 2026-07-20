/**
 * Speed ramp helpers (Phase 31).
 * Splits one clip into sequential pieces with graduated playback speeds.
 * Works with the existing constant-speed export path (no new FFmpeg graph).
 */

import {
  clipLane,
  clipLength,
  clipSourceLength,
  type TimelineClip,
} from "./editor-types";

export type SpeedRampKind =
  | "ramp-in" // slow → normal
  | "ramp-out" // normal → slow
  | "ramp-up" // normal → fast
  | "ramp-down" // fast → normal
  | "slow-mo"; // deep slow then recover

const PRESETS: Record<SpeedRampKind, { from: number; to: number; segments: number; label: string }> = {
  "ramp-in": { from: 0.45, to: 1, segments: 4, label: "Ramp in (slow→1×)" },
  "ramp-out": { from: 1, to: 0.45, segments: 4, label: "Ramp out (1×→slow)" },
  "ramp-up": { from: 1, to: 2, segments: 4, label: "Ramp up (1×→2×)" },
  "ramp-down": { from: 2, to: 1, segments: 4, label: "Ramp down (2×→1×)" },
  "slow-mo": { from: 1, to: 0.35, segments: 5, label: "Slow-mo punch" },
};

export function speedRampLabel(kind: SpeedRampKind): string {
  return PRESETS[kind].label;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Build N sequential clips covering the same source range with graduated speeds.
 * Caller replaces the original clip in the timeline array.
 */
export function buildSpeedRampClips(
  clip: TimelineClip,
  kind: SpeedRampKind,
): TimelineClip[] {
  const preset = PRESETS[kind];
  const srcLen = clipSourceLength(clip);
  if (srcLen < 0.4) {
    // Too short to ramp meaningfully — just set midpoint speed
    const mid = (preset.from + preset.to) / 2;
    return [{ ...clip, speed: mid, transition: "none", transitionDuration: 0 }];
  }

  const n = preset.segments;
  const lane = clipLane(clip);
  const pieces: TimelineClip[] = [];
  let tlCursor =
    lane >= 1 || typeof clip.tlStart === "number" ? clip.tlStart ?? 0 : 0;

  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const speed = Math.max(
      0.25,
      Math.min(4, lerp(preset.from, preset.to, (t0 + t1) / 2)),
    );
    const inPoint = clip.inPoint + srcLen * t0;
    const outPoint = clip.inPoint + srcLen * t1;
    const piece: TimelineClip = {
      ...clip,
      id: uid("ramp"),
      inPoint,
      outPoint,
      speed,
      // Keep transitions only on the last piece so xfade doesn't fight the ramp
      transition: i === n - 1 ? clip.transition : "none",
      transitionDuration: i === n - 1 ? clip.transitionDuration : 0,
      fadeIn: i === 0 ? clip.fadeIn : 0,
      fadeOut: i === n - 1 ? clip.fadeOut : 0,
      effects: (clip.effects || []).map((f) => ({
        ...f,
        id: uid("fx"),
      })),
      keyframes: undefined, // avoid mismatched KF across split source
      children: undefined,
      compound: false,
    };
    if (lane >= 1 || typeof clip.tlStart === "number") {
      piece.tlStart = tlCursor;
      tlCursor += clipLength(piece);
    }
    pieces.push(piece);
  }

  // slow-mo: last piece recovers to 1× on remaining — already covered by lerp to 0.35;
  // optionally boost last segment toward 1 for punch feel
  if (kind === "slow-mo" && pieces.length >= 2) {
    pieces[pieces.length - 1] = {
      ...pieces[pieces.length - 1],
      speed: 1,
    };
    // recompute tlStart chain if overlay
    if (lane >= 1 || typeof clip.tlStart === "number") {
      let t = clip.tlStart ?? 0;
      for (let i = 0; i < pieces.length; i++) {
        pieces[i] = { ...pieces[i], tlStart: t };
        t += clipLength(pieces[i]);
      }
    }
  }

  return pieces;
}

/** Replace `clipId` in the clips array with ramp pieces. */
export function replaceClipWithRamp(
  clips: TimelineClip[],
  clipId: string,
  kind: SpeedRampKind,
): TimelineClip[] | null {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return null;
  const pieces = buildSpeedRampClips(clips[idx], kind);
  return [...clips.slice(0, idx), ...pieces, ...clips.slice(idx + 1)];
}

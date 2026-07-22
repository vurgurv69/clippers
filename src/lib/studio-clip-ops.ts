/**
 * Pure timeline clip operations — used by StudioEditor / timeline hooks.
 * Keep side-effect free so trim/blade/magnetic logic is testable and reusable.
 */
import { clamp } from "@/lib/edit-tools";
import {
  clipLane,
  clipLength,
  type ProjectAsset,
  type TimelineClip,
} from "@/lib/editor-types";
import { computeTimeline } from "@/lib/studio-timeline";

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtTime(t: number) {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${cs}`;
}

/** Split one clip at a timeline time. Returns null if the cut is invalid. */
export function splitClipAtTime(
  clips: TimelineClip[],
  starts: number[],
  clipId: string,
  timelineT: number,
  freeV1: boolean,
): { next: TimelineClip[]; selected: string[]; toast?: string } | null {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return null;
  const clip = clips[idx];
  const clipStart = starts[idx] ?? 0;
  if (timelineT < clipStart || timelineT > clipStart + clipLength(clip)) {
    return { next: clips, selected: [], toast: "Cut is outside the clip" };
  }
  const speed = clip.speed || 1;
  const sourceCut = clip.inPoint + (timelineT - clipStart) * speed;
  if (sourceCut <= clip.inPoint + 0.1 || sourceCut >= clip.outPoint - 0.1) {
    return null;
  }
  const a: TimelineClip = { ...clip, id: uid("clip"), outPoint: sourceCut, transition: "none" };
  const b: TimelineClip = {
    ...clip,
    id: uid("clip"),
    inPoint: sourceCut,
    tlStart: clipLane(clip) > 0 || freeV1 ? timelineT : clip.tlStart,
  };
  const next = [...clips];
  next.splice(idx, 1, a, b);
  return { next, selected: [a.id, b.id] };
}

export function slipClipInList(
  clips: TimelineClip[],
  clipId: string,
  deltaTimeline: number,
  assetById: Map<string, ProjectAsset>,
): TimelineClip[] {
  return clips.map((c) => {
    if (c.id !== clipId) return c;
    const asset = assetById.get(c.assetId);
    const maxOut = asset?.kind === "image" ? 30 : asset?.duration ?? c.outPoint;
    const speed = c.speed || 1;
    const dur = c.outPoint - c.inPoint;
    const dSrc = deltaTimeline * speed;
    const ni = clamp(c.inPoint + dSrc, 0, Math.max(0, maxOut - dur));
    return { ...c, inPoint: ni, outPoint: ni + dur };
  });
}

export function trimClipEdgeInList(
  prev: TimelineClip[],
  clipId: string,
  edge: "left" | "right",
  deltaTimeline: number,
  mode: "normal" | "ripple" | "roll",
  freeV1: boolean,
  assetById: Map<string, ProjectAsset>,
): TimelineClip[] {
  const { starts: st } = computeTimeline(prev, { freeMain: freeV1 });
  const idx = prev.findIndex((c) => c.id === clipId);
  if (idx < 0) return prev;
  const clip = prev[idx];
  const lane = clipLane(clip);
  const speed = clip.speed || 1;
  const asset = assetById.get(clip.assetId);
  const maxOut = asset?.kind === "image" ? 30 : asset?.duration ?? clip.outPoint;
  const oldLen = clipLength(clip);
  const start0 = st[idx] ?? 0;

  if (mode === "roll") {
    const ordered = prev
      .map((x, i) => ({ x, i, s: st[i] ?? 0 }))
      .filter((r) => clipLane(r.x) === lane)
      .sort((a, b) => a.s - b.s);
    const oi = ordered.findIndex((r) => r.x.id === clipId);
    if (edge === "left" && oi > 0) {
      const left = ordered[oi - 1].x;
      const dSrc = deltaTimeline * speed;
      const leftSpeed = left.speed || 1;
      const newIn = clamp(clip.inPoint + dSrc, 0, clip.outPoint - 0.2);
      const applied = (newIn - clip.inPoint) / speed;
      const newLeftOut = clamp(
        left.outPoint + applied * leftSpeed,
        left.inPoint + 0.2,
        assetById.get(left.assetId)?.duration ?? left.outPoint + 10,
      );
      return prev.map((c) => {
        if (c.id === left.id) return { ...c, outPoint: newLeftOut };
        if (c.id === clip.id) {
          const patch: Partial<TimelineClip> = { inPoint: newIn };
          if (lane > 0 || freeV1) {
            patch.tlStart = Math.max(0, (c.tlStart ?? start0) + applied);
          }
          return { ...c, ...patch };
        }
        return c;
      });
    }
    if (edge === "right" && oi >= 0 && oi < ordered.length - 1) {
      const right = ordered[oi + 1].x;
      const dSrc = deltaTimeline * speed;
      const rightSpeed = right.speed || 1;
      const newOut = clamp(clip.outPoint + dSrc, clip.inPoint + 0.2, maxOut);
      const applied = (newOut - clip.outPoint) / speed;
      const newRightIn = clamp(
        right.inPoint + applied * rightSpeed,
        0,
        right.outPoint - 0.2,
      );
      return prev.map((c) => {
        if (c.id === clip.id) return { ...c, outPoint: newOut };
        if (c.id === right.id) {
          const patch: Partial<TimelineClip> = { inPoint: newRightIn };
          if (lane > 0 || freeV1) {
            patch.tlStart = Math.max(0, (c.tlStart ?? 0) + applied);
          }
          return { ...c, ...patch };
        }
        return c;
      });
    }
  }

  let next = [...prev];
  if (edge === "left") {
    const dSrc = deltaTimeline * speed;
    const newIn = clamp(clip.inPoint + dSrc, 0, clip.outPoint - 0.2);
    const appliedTl = (newIn - clip.inPoint) / speed;
    const patch: Partial<TimelineClip> = { inPoint: newIn };
    if (lane > 0 || freeV1) {
      patch.tlStart = Math.max(0, (clip.tlStart ?? start0) + appliedTl);
    }
    next[idx] = { ...clip, ...patch };
    const newLen = clipLength(next[idx]);
    const deltaLen = oldLen - newLen;
    if (mode === "ripple" && deltaLen !== 0 && (lane > 0 || freeV1)) {
      const cutAt = (next[idx].tlStart ?? start0) + newLen;
      next = next.map((c, i) => {
        if (i === idx || clipLane(c) !== lane) return c;
        const s = c.tlStart ?? st[i] ?? 0;
        if (s + 1e-4 >= cutAt - 1e-4 || s + 1e-4 >= start0 + oldLen) {
          return { ...c, tlStart: Math.max(0, s - deltaLen) };
        }
        return c;
      });
    }
  } else {
    const dSrc = deltaTimeline * speed;
    const newOut = clamp(clip.outPoint + dSrc, clip.inPoint + 0.2, maxOut);
    next[idx] = { ...clip, outPoint: newOut };
    const newLen = clipLength(next[idx]);
    const deltaLen = oldLen - newLen;
    if (mode === "ripple" && deltaLen !== 0 && (lane > 0 || freeV1)) {
      const cutAt = start0 + oldLen;
      next = next.map((c, i) => {
        if (i === idx || clipLane(c) !== lane) return c;
        const s = c.tlStart ?? st[i] ?? 0;
        if (s + 1e-4 >= cutAt) {
          return { ...c, tlStart: Math.max(0, s - deltaLen) };
        }
        return c;
      });
    }
  }
  return next;
}

/** Pack main-lane starts for magnetic drag begin. */
export function packMainTlStarts(prev: TimelineClip[]): TimelineClip[] {
  const { starts: packed } = computeTimeline(prev, { freeMain: false });
  return prev.map((c, i) =>
    clipLane(c) === 0 ? { ...c, tlStart: packed[i] ?? 0 } : c,
  );
}

/** Premiere-style magnetic ripple while dragging a main clip. */
export function rippleMagneticPack(
  prev: TimelineClip[],
  draggedId: string,
  draggedStart: number,
): TimelineClip[] {
  const mains = prev
    .filter((c) => clipLane(c) === 0)
    .map((c) =>
      c.id === draggedId ? { ...c, tlStart: Math.max(0, draggedStart) } : c,
    )
    .sort((a, b) => (a.tlStart ?? 0) - (b.tlStart ?? 0));
  const ovs = prev.filter((c) => clipLane(c) > 0);
  const dragIdx = mains.findIndex((c) => c.id === draggedId);
  if (dragIdx < 0) return prev;
  let acc = 0;
  const nextMains = mains.map((c, i) => {
    if (i < dragIdx) {
      const n = { ...c, tlStart: acc };
      acc += clipLength(c);
      return n;
    }
    if (i === dragIdx) {
      const start = Math.max(acc, Math.max(0, draggedStart));
      const n = { ...c, tlStart: start };
      acc = start + clipLength(c);
      return n;
    }
    const n = { ...c, tlStart: acc };
    acc += clipLength(c);
    return n;
  });
  return [...nextMains, ...ovs];
}

export function endMagneticPack(
  prev: TimelineClip[],
  freeV1: boolean,
  rippleOrMagnetic: boolean,
): TimelineClip[] {
  const mains = prev
    .filter((c) => clipLane(c) === 0)
    .slice()
    .sort((a, b) => (a.tlStart ?? 0) - (b.tlStart ?? 0));
  const ovs = prev.filter((c) => clipLane(c) > 0);
  if (rippleOrMagnetic) {
    let acc = 0;
    const packed = mains.map((c) => {
      const next = { ...c, tlStart: freeV1 ? acc : undefined };
      acc += clipLength(c);
      return next;
    });
    return [...packed, ...ovs];
  }
  return prev.map((c) =>
    clipLane(c) === 0 && !freeV1 ? { ...c, tlStart: undefined } : c,
  );
}

export function reorderMainClip(
  prev: TimelineClip[],
  id: string,
  targetIndex: number,
): TimelineClip[] {
  const clip = prev.find((c) => c.id === id);
  if (!clip || clipLane(clip) > 0) return prev;
  const mains = prev.filter((c) => clipLane(c) === 0);
  const ovs = prev.filter((c) => clipLane(c) > 0);
  const i = mains.findIndex((c) => c.id === id);
  if (i < 0) return prev;
  const clamped = clamp(targetIndex, 0, mains.length - 1);
  if (clamped === i) return prev;
  const nextMains = [...mains];
  const [moved] = nextMains.splice(i, 1);
  nextMains.splice(clamped, 0, moved);
  return [...nextMains, ...ovs];
}

/**
 * Slide tool: move a clip in time.
 * Overlay / free V1 → absolute `tlStart`.
 * Packed main → magnetic pack so neighbors close around the new position.
 */
export function slideClipInList(
  prev: TimelineClip[],
  clipId: string,
  newStart: number,
  freeV1: boolean,
): TimelineClip[] {
  const clip = prev.find((c) => c.id === clipId);
  if (!clip) return prev;
  const start = Math.max(0, newStart);
  if (clipLane(clip) > 0 || freeV1) {
    return prev.map((c) => (c.id === clipId ? { ...c, tlStart: start } : c));
  }
  return rippleMagneticPack(prev, clipId, start);
}

/** One ripple-trim pass over main-lane clips. Returns same array if nothing removed. */
export function applyRippleTrimOnce(
  prev: TimelineClip[],
  start: number,
  end: number,
  freeMain: boolean,
): TimelineClip[] {
  if (end - start < 0.15) return prev;
  const { starts: st } = computeTimeline(prev, { freeMain });
  const next: TimelineClip[] = [];
  let removed = 0;
  for (let i = 0; i < prev.length; i++) {
    const c = prev[i];
    if (clipLane(c) !== 0) {
      next.push(c);
      continue;
    }
    const a = st[i] ?? 0;
    const len = clipLength(c);
    const b = a + len;
    const speed = c.speed || 1;
    if (b <= start + 0.01 || a >= end - 0.01) {
      next.push(c);
      continue;
    }
    if (a >= start - 0.01 && b <= end + 0.01) {
      removed++;
      continue;
    }
    if (a < start && b > start) {
      const cutSrc = c.inPoint + (start - a) * speed;
      next.push({
        ...c,
        id: uid("clip"),
        outPoint: Math.min(cutSrc, c.outPoint - 0.05),
      });
      removed++;
    }
    if (a < end && b > end) {
      const cutSrc = c.inPoint + (end - a) * speed;
      const right: TimelineClip = {
        ...c,
        id: uid("clip"),
        inPoint: Math.max(cutSrc, c.inPoint + 0.05),
        transition: "none",
      };
      if (freeMain) right.tlStart = end;
      next.push(right);
      removed++;
    }
  }
  return removed ? next : prev;
}

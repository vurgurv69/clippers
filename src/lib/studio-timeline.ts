import { clipLane, clipLength, type TimelineClip, type TextOverlay, type MusicTrack } from "./editor-types";

/**
 * Compute absolute starts for every clip + overall timeline length.
 * - Main lane (0): sequential by default; when `freeMain` is on and a clip has
 *   `tlStart`, that absolute time is used (Premiere-style free place).
 * - Overlay lanes (≥1): always free-placed via `tlStart`.
 */
export function computeTimeline(
  clips: TimelineClip[],
  opts?: { freeMain?: boolean },
): { starts: number[]; total: number } {
  const freeMain = Boolean(opts?.freeMain);
  const starts: number[] = new Array(clips.length).fill(0);
  let acc = 0;
  let maxEnd = 0;

  // Pass 1: place normal main + overlays; skip inactive multicam angles.
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const len = clipLength(c);
    if (c.multicamId && !c.multicamActive) continue;
    if (clipLane(c) === 0) {
      if (freeMain && typeof c.tlStart === "number") {
        const start = Math.max(0, c.tlStart);
        starts[i] = start;
        maxEnd = Math.max(maxEnd, start + len);
      } else {
        starts[i] = acc;
        maxEnd = Math.max(maxEnd, acc + len);
        acc += len;
      }
    } else {
      const start = Math.max(0, c.tlStart ?? 0);
      starts[i] = start;
      maxEnd = Math.max(maxEnd, start + len);
    }
  }

  // Pass 2: park inactive multicam angles under their live sibling (no duration inflate).
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (!(c.multicamId && !c.multicamActive)) continue;
    const liveIdx = clips.findIndex(
      (x) => x.multicamId === c.multicamId && x.multicamActive,
    );
    starts[i] = liveIdx >= 0 ? starts[liveIdx] : acc;
    // Do not extend total for inactive takes — only the live angle owns the span.
  }

  return { starts, total: Math.max(acc, maxEnd) };
}

/** Edge snap targets for magnetic timeline. */
export function collectSnapPoints(opts: {
  clips: TimelineClip[];
  starts: number[];
  total: number;
  texts: TextOverlay[];
  music: MusicTrack | null;
  musicTracks?: MusicTrack[];
  markers?: { t: number }[];
}): number[] {
  const pts = new Set<number>([0, opts.total]);
  opts.clips.forEach((c, i) => {
    const a = opts.starts[i] ?? 0;
    pts.add(a);
    pts.add(a + clipLength(c));
  });
  for (const t of opts.texts) {
    pts.add(t.start);
    pts.add(t.start + t.duration);
  }
  if (opts.music) {
    pts.add(opts.music.start);
    pts.add(opts.music.start + Math.max(0.1, opts.music.outPoint - opts.music.inPoint));
  }
  for (const m of opts.musicTracks || []) {
    pts.add(m.start);
    pts.add(m.start + Math.max(0.1, m.outPoint - m.inPoint));
  }
  for (const mk of opts.markers || []) pts.add(Math.max(0, mk.t));
  return Array.from(pts);
}

export function snapToPoints(
  t: number,
  points: number[],
  threshold: number,
  extra: number[] = [],
): number {
  let best = t;
  let bestD = threshold;
  for (const p of [...points, ...extra]) {
    const d = Math.abs(p - t);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return Math.max(0, best);
}

/** Index of the main-lane clip under the playhead. */
export function activeMainIndex(clips: TimelineClip[], starts: number[], current: number): number {
  let idx = -1;
  let bestStart = -1;
  for (let i = 0; i < clips.length; i++) {
    if (clipLane(clips[i]) !== 0) continue;
    // Inactive multicam angles are not the program feed.
    if (clips[i].multicamId && !clips[i].multicamActive) continue;
    const a = starts[i] ?? 0;
    const b = a + clipLength(clips[i]);
    if (current >= a && current < b) {
      if (a >= bestStart) {
        bestStart = a;
        idx = i;
      }
    } else if (idx < 0 && a <= current + 0.0001) {
      idx = i;
    }
  }
  return idx;
}

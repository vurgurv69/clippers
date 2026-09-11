/**
 * Transient / beat onset detection from RMS energy windows.
 * Used to snap cuts and place beat markers on the timeline.
 */

export type BeatMarker = {
  t: number;
  strength: number;
};

/**
 * Detect onsets where local energy rises sharply vs a rolling mean.
 * @param windows — RMS samples (e.g. from computeRmsWindows with hop ~0.05–0.1s)
 * @param sensitivity — 0..1 (higher = more markers)
 */
export function detectBeatsFromRms(
  windows: Array<{ t: number; rms: number }>,
  sensitivity = 0.55,
): BeatMarker[] {
  if (windows.length < 8) return [];
  const sens = Math.max(0.05, Math.min(1, sensitivity));
  const beats: BeatMarker[] = [];
  const look = 4;
  let lastT = -999;

  for (let i = look; i < windows.length - 1; i++) {
    let mean = 0;
    for (let j = i - look; j < i; j++) mean += windows[j].rms;
    mean /= look;
    const cur = windows[i].rms;
    const next = windows[i + 1].rms;
    const rise = cur - mean;
    const threshold = 0.02 + (1 - sens) * 0.08 + mean * (0.35 + (1 - sens) * 0.5);
    // Local peak: rising into this frame, falling after.
    if (rise > threshold && cur >= next && cur > windows[i - 1].rms) {
      const t = windows[i].t;
      // Refractory period ~120ms to avoid double-hits.
      if (t - lastT < 0.12) continue;
      lastT = t;
      beats.push({ t, strength: Math.min(1, rise / Math.max(0.001, threshold)) });
    }
  }
  return beats;
}

/** Estimate BPM from inter-onset intervals (rough). */
export function estimateBpm(beats: BeatMarker[]): number | null {
  if (beats.length < 4) return null;
  const gaps: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const g = beats[i].t - beats[i - 1].t;
    if (g > 0.25 && g < 2.0) gaps.push(g);
  }
  if (gaps.length < 3) return null;
  gaps.sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)];
  const bpm = Math.round(60 / mid);
  if (bpm < 60 || bpm > 200) return null;
  return bpm;
}

/** Snap a time to the nearest beat within thresholdSec. */
export function snapToBeat(
  t: number,
  beats: BeatMarker[],
  thresholdSec = 0.08,
): number {
  let best = t;
  let bestD = thresholdSec;
  for (const b of beats) {
    const d = Math.abs(b.t - t);
    if (d < bestD) {
      bestD = d;
      best = b.t;
    }
  }
  return best;
}

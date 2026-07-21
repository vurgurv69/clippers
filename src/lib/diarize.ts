/**
 * Lightweight speaker diarization from pause gaps + energy (no extra ML deps).
 * Assigns speakerId 0..N-1 onto transcript words for colored captions.
 */
import type { TranscriptSegment, TranscriptWord } from "./types";

export type DiarizedWord = TranscriptWord & { speakerId: number };

const SPEAKER_COLORS = [
  "&H0000E5FF", // cyan
  "&H0000FF9C", // green
  "&H00FF7A4D", // coral
  "&H00FF4DFF", // magenta
  "&H00FFB84D", // amber
];

export function speakerAssColor(speakerId: number): string {
  return SPEAKER_COLORS[Math.abs(speakerId) % SPEAKER_COLORS.length];
}

/**
 * Split turns on long pauses, then cluster turns by average "energy"
 * (word density / length heuristic) into up to `maxSpeakers` voices.
 */
export function diarizeSegments(
  segments: TranscriptSegment[],
  maxSpeakers = 3,
): { segments: TranscriptSegment[]; speakerCount: number } {
  const words: DiarizedWord[] = segments
    .flatMap((s) => s.words)
    .filter((w) => w.word.trim())
    .sort((a, b) => a.start - b.start)
    .map((w) => ({ ...w, speakerId: 0 }));

  if (words.length < 4) {
    return { segments, speakerCount: 1 };
  }

  // Build turns separated by pauses > 0.55s
  type Turn = { words: DiarizedWord[]; energy: number };
  const turns: Turn[] = [];
  let cur: DiarizedWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > 0.55 && cur.length) {
      turns.push({ words: cur, energy: turnEnergy(cur) });
      cur = [];
    }
    cur.push(words[i]);
  }
  if (cur.length) turns.push({ words: cur, energy: turnEnergy(cur) });

  if (turns.length < 2) {
    return { segments, speakerCount: 1 };
  }

  // K-means-ish on energy into 2..maxSpeakers
  const k = Math.min(maxSpeakers, Math.max(2, Math.round(turns.length / 4)));
  const centers = seedCenters(
    turns.map((t) => t.energy),
    k,
  );
  const labels = turns.map((t) => nearest(centers, t.energy));

  // Smooth: prefer alternating on consecutive turns with similar energy
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] === labels[i - 1] && Math.abs(turns[i].energy - turns[i - 1].energy) > 0.15) {
      labels[i] = (labels[i - 1] + 1) % k;
    }
  }

  for (let i = 0; i < turns.length; i++) {
    for (const w of turns[i].words) w.speakerId = labels[i];
  }

  const byId = new Map<number, DiarizedWord[]>();
  for (const w of words) {
    const list = byId.get(w.speakerId) || [];
    list.push(w);
    byId.set(w.speakerId, list);
  }

  // Rebuild segments keeping original timing buckets ~10 words
  const rebuilt: TranscriptSegment[] = [];
  let bucket: DiarizedWord[] = [];
  let segStart = words[0].start;
  const flush = (end: number) => {
    if (!bucket.length) return;
    rebuilt.push({
      id: rebuilt.length,
      start: segStart,
      end,
      text: bucket.map((w) => w.word).join(" "),
      words: bucket.map(({ word, start, end, speakerId }) => ({
        word,
        start,
        end,
        speakerId,
      })),
    });
    bucket = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!bucket.length) segStart = w.start;
    bucket.push(w);
    const speakerChange =
      i < words.length - 1 && words[i + 1].speakerId !== w.speakerId;
    if (bucket.length >= 10 || /[.!?؟۔]$/.test(w.word) || speakerChange) {
      flush(w.end);
    }
  }
  flush(words[words.length - 1].end);

  return { segments: rebuilt, speakerCount: k };
}

function turnEnergy(words: DiarizedWord[]) {
  const dur = Math.max(0.2, words[words.length - 1].end - words[0].start);
  const chars = words.reduce((n, w) => n + w.word.length, 0);
  return chars / dur / 20; // normalize ~0..2
}

function seedCenters(values: number[], k: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const centers: number[] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(((i + 0.5) / k) * (sorted.length - 1));
    centers.push(sorted[idx]);
  }
  return centers;
}

function nearest(centers: number[], v: number) {
  let best = 0;
  let dist = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const d = Math.abs(centers[i] - v);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}

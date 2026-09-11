/**
 * Lightweight speaker diarization from pause gaps + energy/pitch heuristics.
 * Assigns speakerId 0..3 onto transcript words for colored captions.
 */
import type { TranscriptSegment, TranscriptWord } from "./types";

export type DiarizedWord = TranscriptWord & { speakerId: number };

/** Match generateAssKaraoke palette: yellow, cyan, green, magenta. */
export const SPEAKER_COLORS = [
  "&H0000FFFF",
  "&H00FFFF00",
  "&H0000FF00",
  "&H00FF00FF",
];

export function speakerAssColor(speakerId: number): string {
  return SPEAKER_COLORS[Math.abs(speakerId) % SPEAKER_COLORS.length];
}

/**
 * Split turns on long pauses, then cluster turns by energy + pitch proxy
 * into up to `maxSpeakers` voices (default 4).
 */
export function diarizeSegments(
  segments: TranscriptSegment[],
  maxSpeakers = 4,
): { segments: TranscriptSegment[]; speakerCount: number } {
  const cap = Math.max(1, Math.min(4, maxSpeakers));
  const words: DiarizedWord[] = segments
    .flatMap((s) => s.words)
    .filter((w) => w.word.trim())
    .sort((a, b) => a.start - b.start)
    .map((w) => ({ ...w, speakerId: w.speakerId ?? 0 }));

  if (words.length < 4) {
    return { segments, speakerCount: 1 };
  }

  const tagged = new Set(
    words.map((w) => w.speakerId).filter((id) => id != null),
  );
  if (tagged.size > 1 && words.some((w) => w.speakerId != null && w.speakerId > 0)) {
    const remap = new Map<number, number>();
    let next = 0;
    for (const w of words) {
      const raw = w.speakerId ?? 0;
      if (!remap.has(raw)) remap.set(raw, next++ % cap);
      w.speakerId = remap.get(raw)!;
    }
    return { segments: rebuildSegments(words), speakerCount: remap.size };
  }

  type Turn = { words: DiarizedWord[]; feature: number };
  const turns: Turn[] = [];
  let cur: DiarizedWord[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > 0.55 && cur.length) {
      turns.push({ words: cur, feature: turnFeature(cur) });
      cur = [];
    }
    cur.push(words[i]);
  }
  if (cur.length) turns.push({ words: cur, feature: turnFeature(cur) });

  if (turns.length < 2) {
    return { segments, speakerCount: 1 };
  }

  const k = Math.min(cap, Math.max(2, Math.round(turns.length / 4)));
  const centers = seedCenters(
    turns.map((t) => t.feature),
    k,
  );
  const labels = turns.map((t) => nearest(centers, t.feature));

  for (let i = 1; i < labels.length; i++) {
    if (
      labels[i] === labels[i - 1] &&
      Math.abs(turns[i].feature - turns[i - 1].feature) > 0.18
    ) {
      labels[i] = (labels[i - 1] + 1) % k;
    }
  }

  for (let i = 0; i < turns.length; i++) {
    for (const w of turns[i].words) w.speakerId = labels[i];
  }

  return { segments: rebuildSegments(words), speakerCount: k };
}

function rebuildSegments(words: DiarizedWord[]): TranscriptSegment[] {
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
  return rebuilt;
}

/** Energy (chars/sec) + pitch proxy (shorter mean word = higher). */
function turnFeature(words: DiarizedWord[]) {
  const dur = Math.max(0.2, words[words.length - 1].end - words[0].start);
  const chars = words.reduce((n, w) => n + w.word.length, 0);
  const energy = chars / dur / 20;
  const meanWord =
    words.reduce((n, w) => n + Math.max(0.05, w.end - w.start), 0) /
    words.length;
  const pitch = Math.min(4, 1 / meanWord);
  const rate = words.length / dur;
  return energy * 0.55 + pitch * 0.25 + Math.min(3, rate) * 0.2;
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

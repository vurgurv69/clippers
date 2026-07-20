/**
 * FFmpeg silence / active-range detection for Growth Hub analyze.
 * Reuses the same silencedetect approach as ai-clips.ts.
 */

import fs from "fs/promises";
import path from "path";
import { ffmpegPath, runCommand } from "./binaries";
import { assetsDir, cacheDir } from "./editor-project";
import type { TranscriptSegment } from "./types";

export type TimeRange = { start: number; end: number };

/** Invert silence regions → loud/active windows. */
export async function detectActiveRanges(
  videoPath: string,
  duration: number,
): Promise<{ active: TimeRange[]; silences: TimeRange[] }> {
  try {
    const probeDur = Math.min(duration, 600); // cap scan for speed
    const { stderr } = await runCommand(ffmpegPath(), [
      "-hide_banner",
      "-t",
      String(probeDur),
      "-i",
      videoPath,
      "-af",
      "silencedetect=noise=-35dB:d=0.6",
      "-f",
      "null",
      "-",
    ]);

    const silences: TimeRange[] = [];
    const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) =>
      Number(m[1]),
    );
    const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) =>
      Number(m[1]),
    );
    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
      silences.push({ start: starts[i], end: ends[i] });
    }

    const active: TimeRange[] = [];
    let cursor = 0;
    for (const sil of silences.sort((a, b) => a.start - b.start)) {
      if (sil.start > cursor + 1) active.push({ start: cursor, end: sil.start });
      cursor = Math.max(cursor, sil.end);
    }
    if (cursor < probeDur - 1) active.push({ start: cursor, end: probeDur });

    return {
      active: active.length ? active : [{ start: 0, end: duration }],
      silences: silences.filter((s) => s.end - s.start >= 1.0),
    };
  } catch {
    return { active: [{ start: 0, end: duration }], silences: [] };
  }
}

export function transcriptCachePath(projectId: string, assetId: string) {
  return path.join(cacheDir(projectId), `transcript-${assetId}.json`);
}

export async function loadCachedTranscript(
  projectId: string,
  assetId: string,
): Promise<{ segments: TranscriptSegment[]; text: string } | null> {
  try {
    const raw = await fs.readFile(transcriptCachePath(projectId, assetId), "utf8");
    const data = JSON.parse(raw) as {
      segments?: TranscriptSegment[];
      text?: string;
    };
    if (!data.segments?.length) return null;
    const text = data.text || data.segments.map((s) => s.text).join(" ");
    return { segments: data.segments, text };
  } catch {
    return null;
  }
}

export async function saveCachedTranscript(
  projectId: string,
  assetId: string,
  segments: TranscriptSegment[],
) {
  await fs.mkdir(cacheDir(projectId), { recursive: true });
  const text = segments.map((s) => s.text).join(" ");
  await fs.writeFile(
    transcriptCachePath(projectId, assetId),
    JSON.stringify({ segments, text, savedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

export function assetMediaPath(projectId: string, filename: string) {
  return path.join(assetsDir(projectId), filename);
}

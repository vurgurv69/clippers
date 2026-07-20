/**
 * Parse Growth Hub chapter lines like "0:12 — Beat 1" or "1:05 - Intro".
 */
export function parseChapterLine(
  line: string,
): { t: number; label: string } | null {
  const raw = line.trim();
  if (!raw) return null;
  const m = raw.match(
    /^(\d{1,2}):(\d{2})(?:\.(\d+))?\s*[—–\-:]\s*(.+)$/,
  );
  if (m) {
    const min = Number(m[1]) || 0;
    const sec = Number(m[2]) || 0;
    const frac = m[3] ? Number(`0.${m[3]}`) : 0;
    return {
      t: min * 60 + sec + frac,
      label: m[4].trim().slice(0, 48),
    };
  }
  // Fallback: leading seconds number
  const n = raw.match(/^(\d+(?:\.\d+)?)\s*[—–\-:]?\s*(.+)$/);
  if (n) {
    return { t: Number(n[1]) || 0, label: n[2].trim().slice(0, 48) };
  }
  return null;
}

/** Format seconds as YouTube chapter stamp `M:SS` or `H:MM:SS`. */
export function formatChapterStamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Build a YouTube description chapter block (must start at 0:00).
 */
export function formatYoutubeChaptersBlock(chapters: string[]): string {
  const parsed = chapters
    .map((line) => parseChapterLine(line))
    .filter((p): p is { t: number; label: string } => Boolean(p))
    .sort((a, b) => a.t - b.t);
  if (!parsed.length) return "";
  const lines: string[] = [];
  if (parsed[0].t > 0.5) {
    lines.push(`0:00 Intro`);
  }
  for (const p of parsed) {
    lines.push(`${formatChapterStamp(p.t)} ${p.label}`);
  }
  return lines.join("\n");
}

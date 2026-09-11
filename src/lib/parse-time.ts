/** Parse UI times: `03:00`, `1:02:03`, `180`, `180s`, `3m`, `3m20s`. */
export function parseClockTime(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const combo = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (combo && (combo[1] || combo[2] || combo[3]) && !text.includes(":")) {
    const h = Number(combo[1] || 0);
    const m = Number(combo[2] || 0);
    const s = Number(combo[3] || 0);
    return h * 3600 + m * 60 + s;
  }

  if (/^\d+(\.\d+)?s$/.test(text)) return Number(text.slice(0, -1));
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);

  const parts = text.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function clampClipCount(raw: unknown, fallback = 4): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, n));
}

export function resolveManualRange(
  startRaw: string | number | null | undefined,
  endRaw: string | number | null | undefined,
  duration: number,
): { start: number; end: number } | null {
  const startIn = parseClockTime(startRaw);
  const endIn = parseClockTime(endRaw);
  if (startIn == null && endIn == null) return null;

  let start = startIn ?? 0;
  let end = endIn ?? Math.min(duration, start + 50);
  if (startIn == null && endIn != null) {
    start = Math.max(0, end - 50);
  }
  start = Math.max(0, Math.min(duration - 0.4, start));
  end = Math.max(start + 0.4, Math.min(duration, end));
  return { start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

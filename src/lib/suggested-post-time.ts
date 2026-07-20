/**
 * Parse Growth Hub suggestedPostTime strings into a concrete Date.
 * Examples: "Tue–Thu 18:00–20:00 local", "Sat–Sun 10:00–12:00 local"
 */

export function resolveSuggestedPostTime(
  hint: string | undefined,
  from: Date = new Date(),
): Date {
  const d = new Date(from.getTime());
  const text = (hint || "").toLowerCase();

  const weekend = /sat|sun|weekend/.test(text);
  const midweek = /tue|wed|thu|midweek/.test(text) || !weekend;

  // Prefer start of the suggested window
  let hour = 18;
  let minute = 0;
  const range = text.match(/(\d{1,2}):(\d{2})\s*[–\-]\s*(\d{1,2}):(\d{2})/);
  if (range) {
    hour = Number(range[1]) || 18;
    minute = Number(range[2]) || 0;
  } else {
    const single = text.match(/(\d{1,2}):(\d{2})/);
    if (single) {
      hour = Number(single[1]) || 18;
      minute = Number(single[2]) || 0;
    } else if (weekend) {
      hour = 10;
    }
  }

  // Advance to next matching weekday
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(d.getTime());
    candidate.setDate(d.getDate() + i);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= from.getTime() + 60_000) continue;
    const dow = candidate.getDay(); // 0 Sun … 6 Sat
    if (weekend && (dow === 0 || dow === 6)) return candidate;
    if (midweek && !weekend && dow >= 2 && dow <= 4) return candidate;
    if (!weekend && !midweek && i === 1) return candidate;
  }

  // Fallback: tomorrow at hour
  const fallback = new Date(from.getTime());
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hour, minute, 0, 0);
  return fallback;
}

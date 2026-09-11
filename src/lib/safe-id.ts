import path from "path";

/** Safe resource ID: UUID or alphanumeric + _- only (no path separators). */
export const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSafetyError";
  }
}

/** Reject traversal / injection IDs before any path.join into .data/. */
export function assertSafeId(id: string, label = "id"): string {
  const trimmed = (id || "").trim();
  if (!trimmed) throw new PathSafetyError(`Missing ${label}`);
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new PathSafetyError(`Invalid ${label}`);
  }
  if (!SAFE_ID_RE.test(trimmed)) {
    throw new PathSafetyError(`Invalid ${label}`);
  }
  return trimmed;
}

/** Prefer UUID-shaped IDs for jobs/projects when present. */
export function assertSafeResourceId(id: string, label = "id"): string {
  const trimmed = assertSafeId(id, label);
  // Allow non-UUID legacy short ids that still match SAFE_ID_RE.
  return trimmed;
}

/**
 * Resolve `segments` under `root` and ensure the result stays inside root
 * (blocks `..` and symlink-style escapes after resolve).
 */
export function resolveUnderRoot(root: string, ...segments: string[]): string {
  const rootResolved = path.resolve(root);
  const cleaned = segments.map((s) => {
    const base = path.basename(String(s || ""));
    if (!base || base === "." || base === "..") {
      throw new PathSafetyError("Invalid path segment");
    }
    return base;
  });
  const resolved = path.resolve(rootResolved, ...cleaned);
  const rel = path.relative(rootResolved, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathSafetyError("Path escapes data root");
  }
  return resolved;
}

/** Safe basename for user-supplied filenames (clips, assets). */
export function safeBasename(name: string): string {
  const base = path.basename(String(name || "").replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") {
    throw new PathSafetyError("Invalid filename");
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    throw new PathSafetyError("Invalid filename");
  }
  return base;
}

/**
 * Clip ids are `clip-1`, `clip-12`, etc. — never free-form paths.
 * Accepts SAFE_ID_RE so legacy ids still work.
 */
export function assertSafeClipId(clipId: string): string {
  return assertSafeId(clipId, "clipId");
}

/** Resolve a file under a job/project root with basename + containment checks. */
export function resolveDataFile(root: string, ...segments: string[]): string {
  const cleaned = segments.map((s, i) => {
    // Last segment is a filename (may include extension); earlier are folder names.
    if (i === segments.length - 1) return safeBasename(s);
    return assertSafeId(s, "path segment");
  });
  return resolveUnderRoot(root, ...cleaned);
}

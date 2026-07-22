/**
 * Nested compound clip path helpers — root timeline ↔ compound children.
 */
import { clipLength, type TimelineClip } from "@/lib/editor-types";

/** Clips visible at a compound nest path (empty path = root timeline). */
export function getClipsAtPath(root: TimelineClip[], path: string[]): TimelineClip[] {
  let nodes = root;
  for (const id of path) {
    const parent = nodes.find((c) => c.id === id);
    if (!parent?.children?.length) return [];
    nodes = parent.children;
  }
  return nodes;
}

/** Replace the clip list at nest path; syncs compound outPoint when writing children. */
export function updateClipsAtPath(
  root: TimelineClip[],
  path: string[],
  nextChildren: TimelineClip[],
): TimelineClip[] {
  if (path.length === 0) return nextChildren;
  const [head, ...rest] = path;
  return root.map((c) => {
    if (c.id !== head) return c;
    if (rest.length === 0) {
      return {
        ...c,
        children: nextChildren,
        outPoint: Math.max(
          0.1,
          nextChildren.reduce((s, x) => s + clipLength(x), 0),
        ),
      };
    }
    return {
      ...c,
      children: updateClipsAtPath(c.children || [], rest, nextChildren),
    };
  });
}

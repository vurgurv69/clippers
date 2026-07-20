/** Timeline edit tool ids — shared by toolbar, shell cursors, and timeline handlers. */
export type ToolId =
  | "select"
  | "blade"
  | "hand"
  | "zoom"
  | "trim"
  | "ripple"
  | "slip"
  | "slide"
  | "roll";

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

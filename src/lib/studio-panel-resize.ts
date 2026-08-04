import { clamp } from "@/lib/edit-tools";

export const DEFAULT_BIN_W = 360;
export const DEFAULT_INSPECTOR_W = 340;
export const DEFAULT_TIMELINE_H = 42; // vh — video + audio visible without vertical scroll

/** Drag-resize the media bin or inspector rail. */
export function startPanelResize(
  which: "bin" | "inspector",
  clientX0: number,
  binW: number,
  inspectorW: number,
  setBinW: (w: number) => void,
  setInspectorW: (w: number) => void,
) {
  const base = which === "bin" ? binW : inspectorW;
  const move = (e: PointerEvent) => {
    const dx = e.clientX - clientX0;
    if (which === "bin") setBinW(clamp(base + dx, 240, 520));
    else setInspectorW(clamp(base - dx, 280, 560));
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** Vertical drag — timeline height as viewport %. */
export function startTimelineResize(
  clientY0: number,
  timelineHVh: number,
  setTimelineHVh: (h: number) => void,
) {
  const base = timelineHVh;
  const move = (e: PointerEvent) => {
    const dy = clientY0 - e.clientY;
    const deltaVh = (dy / Math.max(1, window.innerHeight)) * 100;
    setTimelineHVh(clamp(base + deltaVh, 28, 62));
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

export function resetPanelWidth(which: "bin" | "inspector"): number {
  return which === "bin" ? DEFAULT_BIN_W : DEFAULT_INSPECTOR_W;
}

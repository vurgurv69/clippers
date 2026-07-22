import { clamp } from "@/lib/edit-tools";

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
    if (which === "bin") setBinW(clamp(base + dx, 160, 360));
    else setInspectorW(clamp(base - dx, 220, 440));
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

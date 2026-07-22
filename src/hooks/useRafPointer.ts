/**
 * Throttle pointer-move work to one update per animation frame.
 * Keeps scrubbing / drag at ~60fps without flooding React setState.
 */
export function rafPointerMove(
  onMove: (e: PointerEvent) => void,
  onUp?: (e: PointerEvent) => void,
) {
  let raf = 0;
  let latest: PointerEvent | null = null;

  const flush = () => {
    raf = 0;
    if (latest) onMove(latest);
    latest = null;
  };

  const move = (e: PointerEvent) => {
    latest = e;
    if (!raf) raf = requestAnimationFrame(flush);
  };

  const up = (e: PointerEvent) => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (latest) onMove(latest);
    latest = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onUp?.(e);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
}

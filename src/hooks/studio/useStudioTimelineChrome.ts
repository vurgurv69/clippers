"use client";

import {
  useEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { clamp } from "@/lib/edit-tools";

export type StudioTimelineChromeArgs = {
  trackRef: RefObject<HTMLDivElement | null>;
  playing: boolean;
  current: number;
  pxPerSec: number;
  setPxPerSec: Dispatch<SetStateAction<number>>;
  setViewScroll: Dispatch<SetStateAction<{ left: number; width: number }>>;
};

/** Timeline viewport: resize sync, playhead auto-scroll, Ctrl+wheel zoom. */
export function useStudioTimelineChrome(args: StudioTimelineChromeArgs) {
  const { trackRef, playing, current, pxPerSec, setPxPerSec, setViewScroll } = args;

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const sync = () => setViewScroll({ left: el.scrollLeft, width: el.clientWidth });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewScroll, trackRef]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || !playing) return;
    const x = current * pxPerSec;
    const view = el.scrollLeft;
    const w = el.clientWidth;
    if (x < view + 40 || x > view + w - 80) {
      el.scrollLeft = Math.max(0, x - w * 0.4);
    }
  }, [current, playing, pxPerSec, trackRef]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft;
      const tAtCursor = cursorX / pxPerSec;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const next = clamp(Math.round(pxPerSec * factor), 24, 400);
      setPxPerSec(next);
      requestAnimationFrame(() => {
        const el2 = trackRef.current;
        if (el2) el2.scrollLeft = Math.max(0, tAtCursor * next - (e.clientX - rect.left));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pxPerSec, setPxPerSec, trackRef]);
}

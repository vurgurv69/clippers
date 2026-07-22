"use client";

import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import { rafPointerMove } from "@/hooks/useRafPointer";
import { clamp } from "@/lib/edit-tools";
import {
  endMagneticPack,
  packMainTlStarts,
  reorderMainClip,
  rippleMagneticPack,
  slideClipInList,
  slipClipInList,
  splitClipAtTime,
  trimClipEdgeInList,
} from "@/lib/studio-clip-ops";
import { collectSnapPoints, snapToPoints } from "@/lib/studio-timeline";
import type {
  MusicTrack,
  ProjectAsset,
  TextOverlay,
  TimelineClip,
  TimelineMarker,
} from "@/lib/editor-types";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioTimelineOpsArgs = {
  trackRef: RefObject<HTMLDivElement | null>;
  curRef: { current: number };
  viewClips: TimelineClip[];
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  starts: number[];
  current: number;
  total: number;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  activeIndex: number;
  freeV1: boolean;
  magnetic: boolean;
  rippleEnabled: boolean;
  snapEnabled: boolean;
  pxPerSec: number;
  scrubTotal: number;
  viewScroll: { left: number; width: number };
  assetById: Map<string, ProjectAsset>;
  texts: TextOverlay[];
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  markers: TimelineMarker[];
  nestedEditing: boolean;
  setMagDragActive: Dispatch<SetStateAction<boolean>>;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  pushToast: ToastFn;
};

/**
 * Timeline interaction: snap, viewport culling, drag, blade/trim/slip, magnetic pack.
 */
export function useStudioTimelineOps(args: StudioTimelineOpsArgs) {
  const {
    trackRef,
    curRef,
    viewClips,
    setViewClips,
    starts,
    current,
    total,
    selectedId,
    setSelectedId,
    setSelectedIds,
    activeIndex,
    freeV1,
    magnetic,
    rippleEnabled,
    snapEnabled,
    pxPerSec,
    scrubTotal,
    viewScroll,
    assetById,
    texts,
    music,
    musicTracks,
    markers,
    nestedEditing,
    setMagDragActive,
    patchClip,
    pushToast,
  } = args;

  const snapPoints = useMemo(
    () =>
      collectSnapPoints({
        clips: viewClips,
        starts,
        total,
        texts: nestedEditing ? [] : texts,
        music: nestedEditing ? null : music,
        musicTracks: nestedEditing ? [] : musicTracks,
        markers: nestedEditing ? [] : markers,
      }),
    [viewClips, starts, total, texts, music, musicTracks, markers, nestedEditing],
  );

  const snapSec = useCallback(
    (t: number) => {
      if (!snapEnabled) return Math.max(0, t);
      const threshold = (magnetic ? 28 : 10) / pxPerSec;
      return snapToPoints(t, snapPoints, threshold, [curRef.current]);
    },
    [snapEnabled, magnetic, pxPerSec, snapPoints, curRef],
  );

  const clipInView = useCallback(
    (leftPx: number, widthPx: number) => {
      const pad = 320;
      return (
        leftPx + widthPx > viewScroll.left - pad &&
        leftPx < viewScroll.left + viewScroll.width + pad
      );
    },
    [viewScroll.left, viewScroll.width],
  );

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      return clamp(x / pxPerSec, 0, scrubTotal);
    },
    [trackRef, pxPerSec, scrubTotal],
  );

  const dragHandle = useCallback(
    (clientX0: number, onDelta: (deltaSec: number) => void, onUp?: () => void) => {
      rafPointerMove(
        (e) => onDelta((e.clientX - clientX0) / pxPerSec),
        () => onUp?.(),
      );
    },
    [pxPerSec],
  );

  const beginMagneticDrag = useCallback(
    (clipId: string) => {
      setViewClips((prev) => packMainTlStarts(prev));
      setMagDragActive(true);
      void clipId;
    },
    [setViewClips, setMagDragActive],
  );

  const rippleMagneticWhileDrag = useCallback(
    (draggedId: string, draggedStart: number) => {
      if (!magnetic || !rippleEnabled) {
        patchClip(draggedId, { tlStart: draggedStart });
        return;
      }
      setViewClips((prev) => rippleMagneticPack(prev, draggedId, draggedStart));
    },
    [magnetic, rippleEnabled, patchClip, setViewClips],
  );

  const endMagneticDrag = useCallback(
    (_clipId: string) => {
      setViewClips((prev) => endMagneticPack(prev, freeV1, rippleEnabled || magnetic));
      setMagDragActive(false);
    },
    [setViewClips, freeV1, rippleEnabled, magnetic, setMagDragActive],
  );

  const splitClipAt = useCallback(
    (clipId: string, timelineT: number) => {
      const result = splitClipAtTime(viewClips, starts, clipId, timelineT, freeV1);
      if (!result) return;
      if (result.toast) {
        pushToast(result.toast, "info");
        return;
      }
      if (result.next === viewClips) return;
      setViewClips(result.next);
      if (result.selected[0]) {
        setSelectedId(result.selected[0]);
        setSelectedIds(result.selected);
      }
      pushToast("Split", "success");
    },
    [viewClips, starts, freeV1, setViewClips, setSelectedId, setSelectedIds, pushToast],
  );

  const splitAtPlayhead = useCallback(() => {
    let idx = selectedId ? viewClips.findIndex((c) => c.id === selectedId) : -1;
    if (idx < 0) idx = activeIndex;
    if (idx < 0) return;
    splitClipAt(viewClips[idx].id, current);
  }, [selectedId, viewClips, activeIndex, splitClipAt, current]);

  const slipClip = useCallback(
    (clipId: string, deltaTimeline: number) => {
      setViewClips((prev) => slipClipInList(prev, clipId, deltaTimeline, assetById));
    },
    [setViewClips, assetById],
  );

  const slideClip = useCallback(
    (clipId: string, newStart: number) => {
      setViewClips((prev) => slideClipInList(prev, clipId, newStart, freeV1));
    },
    [setViewClips, freeV1],
  );

  const trimClipEdge = useCallback(
    (
      clipId: string,
      edge: "left" | "right",
      deltaTimeline: number,
      mode: "normal" | "ripple" | "roll",
    ) => {
      setViewClips((prev) =>
        trimClipEdgeInList(prev, clipId, edge, deltaTimeline, mode, freeV1, assetById),
      );
    },
    [setViewClips, freeV1, assetById],
  );

  const reorderTo = useCallback(
    (id: string, targetIndex: number) => {
      setViewClips((prev) => reorderMainClip(prev, id, targetIndex));
    },
    [setViewClips],
  );

  return {
    snapPoints,
    snapSec,
    clipInView,
    timeFromClientX,
    dragHandle,
    beginMagneticDrag,
    rippleMagneticWhileDrag,
    endMagneticDrag,
    splitClipAt,
    splitAtPlayhead,
    slipClip,
    slideClip,
    trimClipEdge,
    reorderTo,
  };
}

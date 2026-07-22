"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_TRANSFORM, type ClipTransform, type TimelineClip } from "@/lib/editor-types";
import {
  replaceClipWithRamp,
  speedRampLabel,
  type SpeedRampKind,
} from "@/lib/speed-ramp";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioClipPatchArgs = {
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  pushToast: ToastFn;
};

/** Small clip property patches used across inspector / timeline. */
export function useStudioClipPatch(args: StudioClipPatchArgs) {
  const { setViewClips, setSelectedId, pushToast } = args;

  const patchClip = useCallback(
    (id: string, patch: Partial<TimelineClip>) => {
      setViewClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [setViewClips],
  );

  const applySpeedRamp = useCallback(
    (clipId: string, kind: SpeedRampKind) => {
      setViewClips((prev) => {
        const next = replaceClipWithRamp(prev, clipId, kind);
        if (!next) return prev;
        const added = next.filter((c) => !prev.some((p) => p.id === c.id));
        const pick = added[0]?.id;
        if (pick) queueMicrotask(() => setSelectedId(pick));
        return next;
      });
      pushToast(speedRampLabel(kind), "success");
    },
    [pushToast, setSelectedId, setViewClips],
  );

  const patchColor = useCallback(
    (id: string, patch: Partial<TimelineClip["color"]>) => {
      setViewClips((prev) =>
        prev.map((c) => (c.id === id ? { ...c, color: { ...c.color, ...patch } } : c)),
      );
    },
    [setViewClips],
  );

  const patchTransform = useCallback(
    (id: string, patch: Partial<ClipTransform>) => {
      setViewClips((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, transform: { ...DEFAULT_TRANSFORM, ...(c.transform || {}), ...patch } }
            : c,
        ),
      );
    },
    [setViewClips],
  );

  return { patchClip, applySpeedRamp, patchColor, patchTransform };
}

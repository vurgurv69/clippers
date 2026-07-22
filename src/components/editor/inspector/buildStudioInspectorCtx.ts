import { clipLane, type TimelineClip } from "@/lib/editor-types";
import { computeTimeline } from "@/lib/studio-timeline";
import type { InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";
import type { Dispatch, SetStateAction } from "react";

export type StudioInspectorCtxInput = Omit<
  InspectorPanelCtx,
  "onToggleProxy" | "onToggleFreeV1"
> & {
  setUseProxy: Dispatch<SetStateAction<boolean>>;
  setFreeV1: Dispatch<SetStateAction<boolean>>;
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
};

/** Assemble inspector panel context + shell toggles (proxy / free V1). */
export function buildStudioInspectorCtx(input: StudioInspectorCtxInput): InspectorPanelCtx {
  const { setUseProxy, setFreeV1, setViewClips, pushToast, ...rest } = input;
  return {
    ...rest,
    pushToast,
    onToggleProxy: () => setUseProxy((v) => !v),
    onToggleFreeV1: () => {
      setFreeV1((on) => {
        const next = !on;
        if (next) {
          setViewClips((prev) => {
            const { starts: packed } = computeTimeline(prev, { freeMain: false });
            return prev.map((c, i) =>
              clipLane(c) === 0 ? { ...c, tlStart: packed[i] ?? 0 } : c,
            );
          });
          pushToast("V1 free-place on — drag clips freely", "info");
        } else {
          setViewClips((prev) =>
            prev.map((c) => (clipLane(c) === 0 ? { ...c, tlStart: undefined } : c)),
          );
          pushToast("V1 packed gapless", "info");
        }
        return next;
      });
    },
  };
}

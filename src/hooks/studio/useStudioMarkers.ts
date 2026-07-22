"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { TimelineMarker } from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioMarkersArgs = {
  current: number;
  markers: TimelineMarker[];
  setMarkers: Dispatch<SetStateAction<TimelineMarker[]>>;
  seek: (t: number) => void;
  pushToast: ToastFn;
};

/** Timeline marker CRUD + seek prev/next. */
export function useStudioMarkers(args: StudioMarkersArgs) {
  const { current, markers, setMarkers, seek, pushToast } = args;

  const addMarker = useCallback(() => {
    const mk: TimelineMarker = {
      id: uid("mk"),
      t: current,
      label: `Marker ${markers.length + 1}`,
      color: "#e2a03f",
    };
    setMarkers((prev) => [...prev, mk].sort((a, b) => a.t - b.t));
    pushToast("Marker added", "success");
  }, [current, markers.length, pushToast, setMarkers]);

  const seekPrevMarker = useCallback(() => {
    const prev = [...markers].filter((m) => m.t < current - 0.05).pop();
    if (prev) seek(prev.t);
    else pushToast("No earlier marker", "info");
  }, [current, markers, pushToast, seek]);

  const seekNextMarker = useCallback(() => {
    const next = markers.find((m) => m.t > current + 0.05);
    if (next) seek(next.t);
    else pushToast("No later marker", "info");
  }, [current, markers, pushToast, seek]);

  const patchMarker = useCallback(
    (id: string, patch: Partial<TimelineMarker>) => {
      setMarkers((prev) =>
        prev
          .map((m) => (m.id === id ? { ...m, ...patch } : m))
          .sort((a, b) => a.t - b.t),
      );
    },
    [setMarkers],
  );

  const removeMarker = useCallback(
    (id: string) => {
      setMarkers((prev) => prev.filter((m) => m.id !== id));
    },
    [setMarkers],
  );

  return { addMarker, seekPrevMarker, seekNextMarker, patchMarker, removeMarker };
}

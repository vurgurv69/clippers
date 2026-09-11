"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { TimelineMarker } from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";
import { snapToBeat, type BeatMarker } from "@/lib/beat-detect";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioMarkersArgs = {
  current: number;
  markers: TimelineMarker[];
  setMarkers: Dispatch<SetStateAction<TimelineMarker[]>>;
  seek: (t: number) => void;
  pushToast: ToastFn;
  projectId?: string;
  activeAssetId?: string | null;
};

/** Timeline marker CRUD + seek prev/next + beat detection. */
export function useStudioMarkers(args: StudioMarkersArgs) {
  const {
    current,
    markers,
    setMarkers,
    seek,
    pushToast,
    projectId,
    activeAssetId,
  } = args;

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

  const detectBeats = useCallback(async () => {
    if (!projectId) {
      pushToast("Save / open a project first", "info");
      return;
    }
    pushToast("Detecting beats…", "info");
    try {
      const res = await fetch(`/api/editor/project/${projectId}/beats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: activeAssetId || undefined,
          sensitivity: 0.55,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Beat detection failed");
      const beats = (data.beats || []) as BeatMarker[];
      if (!beats.length) {
        pushToast("No clear beats found — try a music bed", "info");
        return;
      }
      const next: TimelineMarker[] = beats.slice(0, 120).map((b, i) => ({
        id: uid("beat"),
        t: b.t,
        label: `Beat ${i + 1}`,
        color: "#22d3ee",
      }));
      setMarkers((prev) => {
        const kept = prev.filter((m) => !m.label?.startsWith("Beat "));
        return [...kept, ...next].sort((a, b) => a.t - b.t);
      });
      const bpm = data.bpm ? ` · ~${data.bpm} BPM` : "";
      pushToast(`Added ${next.length} beat markers${bpm}`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Beat detection failed", "error");
    }
  }, [activeAssetId, projectId, pushToast, setMarkers]);

  const snapPlayheadToBeat = useCallback(() => {
    const beatMarks = markers.filter((m) => m.label?.startsWith("Beat "));
    if (!beatMarks.length) {
      pushToast("Run Detect beats first", "info");
      return;
    }
    const snapped = snapToBeat(
      current,
      beatMarks.map((m) => ({ t: m.t, strength: 1 })),
      0.12,
    );
    seek(snapped);
  }, [current, markers, pushToast, seek]);

  return {
    addMarker,
    seekPrevMarker,
    seekNextMarker,
    patchMarker,
    removeMarker,
    detectBeats,
    snapPlayheadToBeat,
  };
}

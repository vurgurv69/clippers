"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  clipLane,
  DEFAULT_COLOR,
  DEFAULT_TRANSFORM,
  type MusicTrack,
  type ProjectAsset,
  type TimelineClip,
} from "@/lib/editor-types";
import { applyRippleTrimOnce, uid } from "@/lib/studio-clip-ops";
import { applyEditResultToClip, parseEditPrompt } from "@/lib/ai-edit-prompt";
import type { CleanupItem } from "@/hooks/studio/useStudioAi";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioCleanupArgs = {
  freeV1: boolean;
  current: number;
  assets: ProjectAsset[];
  cleanupItems: CleanupItem[];
  selectedClip: TimelineClip | null;
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setCleanupItems: Dispatch<SetStateAction<CleanupItem[]>>;
  setCleanupDenoiseLevel: Dispatch<SetStateAction<number>>;
  setCleanupStabilizeLevel: Dispatch<SetStateAction<number>>;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  seek: (t: number) => void;
  pushToast: ToastFn;
};

/** Silence/filler trim, denoise/stabilize, duck, AI edit prompt, adjustment layer. */
export function useStudioCleanup(args: StudioCleanupArgs) {
  const {
    freeV1,
    current,
    assets,
    cleanupItems,
    selectedClip,
    music,
    musicTracks,
    setViewClips,
    setCleanupItems,
    setCleanupDenoiseLevel,
    setCleanupStabilizeLevel,
    setMusic,
    setMusicTracks,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    seek,
    pushToast,
  } = args;

  const rippleTrimRange = useCallback(
    (start: number, end: number, opts?: { silent?: boolean }) => {
      if (end - start < 0.15) {
        if (!opts?.silent) pushToast("Range too short", "info");
        return;
      }
      setViewClips((prev) => {
        const next = applyRippleTrimOnce(prev, start, end, freeV1);
        if (next === prev) {
          if (!opts?.silent) pushToast("No clip under that range", "info");
          return prev;
        }
        if (!opts?.silent) pushToast("Range trimmed", "success");
        return next;
      });
      seek(start);
    },
    [freeV1, pushToast, seek, setViewClips],
  );

  const applyCleanupItem = useCallback(
    (item: CleanupItem) => {
      if (item.end - item.start < 0.15) {
        seek(item.start);
        pushToast("Range too short to trim", "info");
        return;
      }
      rippleTrimRange(item.start, item.end);
      setCleanupItems((prev) => prev.filter((x) => x.id !== item.id));
    },
    [pushToast, rippleTrimRange, seek, setCleanupItems],
  );

  const applyCleanupAll = useCallback(() => {
    const items = [...cleanupItems]
      .filter((x) => x.end - x.start >= 0.15)
      .sort((a, b) => b.start - a.start);
    if (!items.length) {
      pushToast("Nothing to trim", "info");
      return;
    }
    setViewClips((prev) => {
      let cur = prev;
      for (const item of items) {
        cur = applyRippleTrimOnce(cur, item.start, item.end, freeV1);
      }
      return cur;
    });
    setCleanupItems([]);
    const last = items[items.length - 1];
    if (last) seek(last.start);
    pushToast(`Trimmed ${items.length} gaps`, "success");
  }, [cleanupItems, freeV1, pushToast, seek, setCleanupItems, setViewClips]);

  const applyDenoiseToMainClips = useCallback(
    (level: number, opts?: { silent?: boolean }) => {
      setCleanupDenoiseLevel(level);
      setViewClips((prev) =>
        prev.map((c) => {
          if (clipLane(c) !== 0) return c;
          const asset = assets.find((a) => a.id === c.assetId);
          if (!asset || asset.kind !== "video" || !asset.hasAudio) return c;
          return { ...c, denoise: level };
        }),
      );
      if (!opts?.silent && level > 0.02) {
        pushToast(`Denoise ${Math.round(level * 100)}% on main clips`, "success");
      }
    },
    [assets, pushToast, setCleanupDenoiseLevel, setViewClips],
  );

  const applyDenoiseDialogue = useCallback(() => {
    applyDenoiseToMainClips(0.4);
  }, [applyDenoiseToMainClips]);

  const applyStabilizeToMainClips = useCallback(
    (level: number, opts?: { silent?: boolean }) => {
      setCleanupStabilizeLevel(level);
      setViewClips((prev) =>
        prev.map((c) => {
          if (clipLane(c) !== 0) return c;
          const asset = assets.find((a) => a.id === c.assetId);
          if (!asset || asset.kind !== "video") return c;
          return { ...c, stabilize: level };
        }),
      );
      if (!opts?.silent && level > 0.02) {
        pushToast(`Stabilize ${Math.round(level * 100)}% on main clips`, "success");
      }
    },
    [assets, pushToast, setCleanupStabilizeLevel, setViewClips],
  );

  const applyStabilizeMain = useCallback(() => {
    applyStabilizeToMainClips(0.55);
  }, [applyStabilizeToMainClips]);

  const duckAllMusicBeds = useCallback(() => {
    const lanes = [...(music ? [music] : []), ...musicTracks];
    if (!lanes.length) {
      pushToast("Add a music bed first", "info");
      setSidebarTab("media");
      return;
    }
    if (music) {
      setMusic({ ...music, duck: Math.max(music.duck ?? 0, 0.7) });
    }
    setMusicTracks((prev) =>
      prev.map((t) => ({ ...t, duck: Math.max(t.duck ?? 0, 0.7) })),
    );
    pushToast(`Duck ${lanes.length} music bed${lanes.length > 1 ? "s" : ""} at 70%`, "success");
  }, [music, musicTracks, pushToast, setMusic, setMusicTracks, setSidebarTab]);

  const applyAiEditPrompt = useCallback(
    (prompt: string, scope: "selected" | "all") => {
      const result = parseEditPrompt(prompt);
      const unclear = result.summary[0]?.startsWith("No clear");
      if (unclear && !result.color && !result.transform && result.speed == null) {
        pushToast(result.summary[0], "info");
        return;
      }
      if (scope === "selected") {
        if (!selectedClip) {
          pushToast("Select a clip first", "info");
          return;
        }
        setViewClips((prev) =>
          prev.map((c) => (c.id === selectedClip.id ? applyEditResultToClip(c, result) : c)),
        );
      } else {
        setViewClips((prev) => prev.map((c) => applyEditResultToClip(c, result)));
      }
      pushToast(result.summary.join(" · "), "success");
    },
    [pushToast, selectedClip, setViewClips],
  );

  const addAdjustmentLayer = useCallback(() => {
    const clip: TimelineClip = {
      id: uid("adj"),
      assetId: "",
      inPoint: 0,
      outPoint: 4,
      speed: 1,
      transition: "none",
      transitionDuration: 0.5,
      color: { ...DEFAULT_COLOR },
      transform: { ...DEFAULT_TRANSFORM, opacity: 0.35 },
      effects: [],
      lane: 1,
      tlStart: current,
      adjustment: true,
      linkedAudio: false,
      volume: 0,
      fadeIn: 0,
      fadeOut: 0,
    };
    setViewClips((prev) => [...prev, clip]);
    setSelectedId(clip.id);
    setSelectedIds([clip.id]);
    setTab("color");
    setSidebarTab("effects");
    pushToast("Adjustment layer on V2 — grade applies over clips below", "success");
  }, [
    current,
    pushToast,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    setViewClips,
  ]);

  return {
    rippleTrimRange,
    applyCleanupItem,
    applyCleanupAll,
    applyDenoiseToMainClips,
    applyDenoiseDialogue,
    applyStabilizeToMainClips,
    applyStabilizeMain,
    duckAllMusicBeds,
    applyAiEditPrompt,
    addAdjustmentLayer,
  };
}

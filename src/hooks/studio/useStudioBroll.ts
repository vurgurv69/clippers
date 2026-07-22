"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  defaultClip,
  type MusicTrack,
  type ProjectAsset,
  type TimelineClip,
} from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioBrollArgs = {
  projectId: string;
  current: number;
  total: number;
  music: MusicTrack | null;
  selectedClip: TimelineClip | null;
  brandPrimary?: string;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  setBrollBusy: Dispatch<SetStateAction<boolean>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  patchColor: (id: string, patch: Partial<TimelineClip["color"]>) => void;
  pushToast: ToastFn;
};

/** Drop assets on the timeline + AI / upload B-roll helpers. */
export function useStudioBroll(args: StudioBrollArgs) {
  const {
    projectId,
    current,
    total,
    music,
    selectedClip,
    brandPrimary,
    setAssets,
    setViewClips,
    setSelectedId,
    setSelectedIds,
    setMusic,
    setMusicTracks,
    setBrollBusy,
    setSidebarTab,
    setTab,
    patchColor,
    pushToast,
  } = args;

  const addAssetToTimeline = useCallback(
    (asset: ProjectAsset, opts?: { lane?: number }) => {
      if (asset.kind === "font") {
        pushToast("Select a text block, then choose this font", "info");
        setSidebarTab("ai");
        setTab("clip");
        return;
      }
      if (asset.kind === "lut") {
        if (!selectedClip) {
          pushToast("Select a clip to apply this LUT", "info");
          return;
        }
        patchColor(selectedClip.id, { lut: asset.filename, preset: "custom" });
        setSidebarTab("effects");
        setTab("color");
        pushToast("LUT applied", "success");
        return;
      }
      if (asset.kind === "audio") {
        if (music) {
          setMusicTracks((prev) => [
            ...prev,
            {
              assetId: asset.id,
              start: current,
              inPoint: 0,
              outPoint: asset.duration || 30,
              volume: 0.8,
              fadeIn: 0.5,
              fadeOut: 1,
            },
          ]);
        } else {
          setMusic({
            assetId: asset.id,
            start: current,
            inPoint: 0,
            outPoint: asset.duration || 30,
            volume: 0.8,
            fadeIn: 0.5,
            fadeOut: 1,
          });
        }
        setSidebarTab("media");
        setTab("audio");
        return;
      }
      const clip = defaultClip(asset, uid("clip"));
      const lane = opts?.lane;
      if (typeof lane === "number" && lane > 0) {
        clip.lane = lane;
        clip.tlStart = current;
        if (asset.kind === "image") clip.outPoint = Math.min(clip.outPoint, 3);
        setViewClips((prev) => [...prev, clip]);
        setSelectedId(clip.id);
        setSelectedIds([clip.id]);
        pushToast(lane >= 2 ? "Added to Overlay" : "Added to Overlay timeline", "success");
        return;
      }
      setViewClips((prev) => [...prev, clip]);
      setSelectedId(clip.id);
      setSelectedIds([clip.id]);
      pushToast("Added to Video timeline", "success");
    },
    [
      current,
      music,
      patchColor,
      pushToast,
      selectedClip,
      setMusic,
      setMusicTracks,
      setSelectedId,
      setSelectedIds,
      setSidebarTab,
      setTab,
      setViewClips,
    ],
  );

  const addAssetAsOverlay = useCallback(
    (asset: ProjectAsset) => {
      if (asset.kind !== "image" && asset.kind !== "video") {
        addAssetToTimeline(asset);
        return;
      }
      addAssetToTimeline(asset, { lane: 1 });
    },
    [addAssetToTimeline],
  );

  const uploadBrollFile = useCallback(
    async (file: File) => {
      setBrollBusy(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/editor/project/${projectId}/asset`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        const asset = data.asset as ProjectAsset;
        setAssets((prev) => [...prev, asset]);
        addAssetAsOverlay(asset);
        pushToast("B-roll on V2", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "B-roll upload failed", "error");
      } finally {
        setBrollBusy(false);
      }
    },
    [addAssetAsOverlay, projectId, pushToast, setAssets, setBrollBusy],
  );

  const generateBrollPreset = useCallback(
    async (preset: string) => {
      setBrollBusy(true);
      try {
        const res = await fetch("/api/ai/broll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            preset,
            color: brandPrimary,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Generate failed");
        const asset = data.asset as ProjectAsset;
        setAssets((prev) => [...prev, asset]);
        addAssetAsOverlay(asset);
        pushToast(`${asset.name} on V2`, "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "B-roll failed", "error");
      } finally {
        setBrollBusy(false);
      }
    },
    [addAssetAsOverlay, brandPrimary, projectId, pushToast, setAssets, setBrollBusy],
  );

  const suggestAndInsertBroll = useCallback(async () => {
    setBrollBusy(true);
    try {
      pushToast("Finding B-roll moments…", "info");
      const res = await fetch("/api/ai/broll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          action: "suggest",
          duration: total,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggest failed");
      const moments = (data.moments || []).slice(0, 3) as {
        start: number;
        end: number;
        reason: string;
        query: string;
      }[];
      if (!moments.length) {
        pushToast("No B-roll moments — run AI Analyze or transcribe first", "info");
        return;
      }

      const newAssets: ProjectAsset[] = [];
      const newClips: TimelineClip[] = [];
      for (const m of moments) {
        const genRes = await fetch("/api/ai/broll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            preset: "soft",
            label: (m.query || m.reason || "B-roll").slice(0, 32),
            color: brandPrimary,
          }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData.error || "Generate failed");
        const asset = genData.asset as ProjectAsset;
        newAssets.push(asset);
        const clip = defaultClip(asset, uid("clip"));
        clip.lane = 1;
        clip.tlStart = m.start;
        clip.outPoint = Math.max(1.5, Math.min(4, m.end - m.start || 2.5));
        newClips.push(clip);
      }

      setAssets((prev) => [...prev, ...newAssets]);
      setViewClips((prev) => [...prev, ...newClips]);
      if (newClips.length === 1) setSelectedId(newClips[0].id);
      setSelectedIds(newClips.map((c) => c.id));
      pushToast(
        `AI B-roll: ${newClips.length} overlay${newClips.length === 1 ? "" : "s"} on V2`,
        "success",
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "B-roll suggest failed", "error");
    } finally {
      setBrollBusy(false);
    }
  }, [
    brandPrimary,
    projectId,
    pushToast,
    setAssets,
    setBrollBusy,
    setSelectedId,
    setSelectedIds,
    setViewClips,
    total,
  ]);

  return {
    addAssetToTimeline,
    addAssetAsOverlay,
    uploadBrollFile,
    generateBrollPreset,
    suggestAndInsertBroll,
  };
}

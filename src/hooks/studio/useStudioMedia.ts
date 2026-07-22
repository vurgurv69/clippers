"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { defaultClip, type MusicTrack, type Project, type ProjectAsset, type TimelineClip } from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioMediaArgs = {
  projectId: string;
  current: number;
  music: MusicTrack | null;
  clips: TimelineClip[];
  musicTracks: MusicTrack[];
  assets: ProjectAsset[];
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  setUploading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  saveProjectState: (quiet?: boolean) => Promise<void>;
  pushToast: ToastFn;
};

/** Media bin: upload, proxy, cleanup, delete, replace. */
export function useStudioMedia(args: StudioMediaArgs) {
  const {
    projectId,
    current,
    music,
    clips,
    musicTracks,
    assets,
    setAssets,
    setMusic,
    setMusicTracks,
    setViewClips,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    setUploading,
    setError,
    saveProjectState,
    pushToast,
  } = args;

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
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
          if (asset.kind === "video" || asset.kind === "image") {
            void fetch(`/api/editor/project/${projectId}/proxy`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assetId: asset.id }),
            })
              .then(async (r) => {
                const d = await r.json();
                if (r.ok && d.project) setAssets((d.project as Project).assets);
              })
              .catch(() => {});
          }
          if (asset.kind === "lut") {
            pushToast("LUT uploaded — apply from Color grading", "success");
          } else if (asset.kind === "font") {
            pushToast("Font uploaded — pick it in Text styles", "success");
          } else if (asset.kind === "audio") {
            const track = {
              assetId: asset.id,
              start: current,
              inPoint: 0,
              outPoint: asset.duration || 30,
              volume: 0.8,
              fadeIn: 0.5,
              fadeOut: 1,
            };
            if (music) setMusicTracks((prev) => [...prev, track]);
            else setMusic(track);
          } else {
            setViewClips((prev) => {
              const clip = defaultClip(asset, uid("clip"));
              setSelectedId(clip.id);
              setSelectedIds([clip.id]);
              setSidebarTab("media");
              setTab("clip");
              return [...prev, clip];
            });
            pushToast("Added to Video timeline", "success");
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [
      projectId,
      current,
      music,
      setUploading,
      setError,
      setAssets,
      setMusic,
      setMusicTracks,
      setViewClips,
      setSelectedId,
      setSelectedIds,
      setSidebarTab,
      setTab,
      pushToast,
    ],
  );

  const generateProxy = useCallback(
    async (asset: ProjectAsset) => {
      if (asset.kind !== "video" && asset.kind !== "image") {
        pushToast("Proxies are for video/image only", "info");
        return;
      }
      pushToast(asset.proxyFile ? "Rebuilding proxy…" : "Generating proxy…", "info");
      try {
        const res = await fetch(`/api/editor/project/${projectId}/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: asset.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Proxy failed");
        setAssets((data.project as Project).assets);
        pushToast("Proxy ready — preview uses low-res", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Proxy failed", "error");
      }
    },
    [projectId, setAssets, pushToast],
  );

  const generateProxiesBatch = useCallback(async () => {
    const need = assets.filter(
      (a) => (a.kind === "video" || a.kind === "image") && !a.proxyFile,
    );
    if (!need.length) {
      pushToast("All media already has proxies", "info");
      return;
    }
    pushToast(`Building ${need.length} proxies…`, "info");
    let ok = 0;
    for (const asset of need) {
      try {
        const res = await fetch(`/api/editor/project/${projectId}/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: asset.id }),
        });
        const data = await res.json();
        if (!res.ok) continue;
        setAssets((data.project as Project).assets);
        ok += 1;
      } catch {
        // continue batch
      }
    }
    pushToast(`Proxies ready: ${ok}/${need.length}`, ok ? "success" : "error");
  }, [assets, projectId, setAssets, pushToast]);

  const cleanupUnusedMedia = useCallback(async () => {
    try {
      await saveProjectState(true);
      const res = await fetch(`/api/editor/project/${projectId}/cleanup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cleanup failed");
      setAssets((data.project as Project).assets);
      pushToast(`Removed ${data.removed} unused`, "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Cleanup failed", "error");
    }
  }, [saveProjectState, projectId, setAssets, pushToast]);

  const deleteMediaAsset = useCallback(
    async (asset: ProjectAsset) => {
      const used =
        clips.some((c) => c.assetId === asset.id) ||
        music?.assetId === asset.id ||
        musicTracks.some((m) => m.assetId === asset.id) ||
        clips.some((c) => c.color.lut === asset.filename);
      if (used && !window.confirm("This media is used. Delete anyway?")) return;
      try {
        const res = await fetch(
          `/api/editor/project/${projectId}/asset?assetId=${encodeURIComponent(asset.id)}`,
          { method: "DELETE" },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Delete failed");
        setAssets((data.project as Project).assets);
        pushToast("Deleted media", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Delete failed", "error");
      }
    },
    [clips, music, musicTracks, projectId, setAssets, pushToast],
  );

  const replaceMediaAsset = useCallback(
    async (asset: ProjectAsset, file: File) => {
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("replaceId", asset.id);
        const res = await fetch(`/api/editor/project/${projectId}/asset`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Replace failed");
        if (data.project) setAssets((data.project as Project).assets);
        else {
          setAssets((prev) =>
            prev.map((a) => (a.id === asset.id ? (data.asset as ProjectAsset) : a)),
          );
        }
        pushToast("Media replaced", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Replace failed", "error");
      }
    },
    [projectId, setAssets, pushToast],
  );

  const renameMediaAsset = useCallback(
    async (asset: ProjectAsset) => {
      const name = window.prompt("Rename media", asset.name);
      if (name == null || !name.trim() || name.trim() === asset.name) return;
      try {
        const res = await fetch(`/api/editor/project/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: asset.id, name: name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Rename failed");
        setAssets((data.project as Project).assets);
        pushToast("Renamed", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Rename failed", "error");
      }
    },
    [projectId, setAssets, pushToast],
  );

  return {
    uploadFiles,
    generateProxy,
    generateProxiesBatch,
    cleanupUnusedMedia,
    deleteMediaAsset,
    replaceMediaAsset,
    renameMediaAsset,
  };
}

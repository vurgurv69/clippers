"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { MusicTrack, ProjectAsset } from "@/lib/editor-types";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioMusicArgs = {
  projectId: string;
  current: number;
  music: MusicTrack | null;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  setUploadingMusic: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  pushToast: ToastFn;
};

/** Music / SFX import, library generate, and track patches. */
export function useStudioMusic(args: StudioMusicArgs) {
  const {
    projectId,
    current,
    music,
    setMusic,
    setMusicTracks,
    setAssets,
    setUploadingMusic,
    setError,
    setTab,
    setSidebarTab,
    pushToast,
  } = args;

  const applyImportedAudio = useCallback(
    async (asset: ProjectAsset) => {
      setAssets((prev) => (prev.some((a) => a.id === asset.id) ? prev : [...prev, asset]));
      const track: MusicTrack = {
        assetId: asset.id,
        start: 0,
        inPoint: 0,
        outPoint: asset.duration || 30,
        volume: 0.8,
        fadeIn: 0.5,
        fadeOut: 1,
      };
      if (!music) setMusic(track);
      else setMusicTracks((prev) => [...prev, track]);
      setTab("audio");
      setSidebarTab("media");
    },
    [music, setAssets, setMusic, setMusicTracks, setSidebarTab, setTab],
  );

  const onMusicFile = useCallback(
    async (file: File) => {
      setUploadingMusic(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/editor/project/${projectId}/asset`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        await applyImportedAudio(data.asset as ProjectAsset);
        pushToast("Audio added", "success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Music upload failed");
      } finally {
        setUploadingMusic(false);
      }
    },
    [applyImportedAudio, projectId, pushToast, setError, setUploadingMusic],
  );

  const onExtractAudioFromVideo = useCallback(
    async (file: File) => {
      setUploadingMusic(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/editor/project/${projectId}/audio-import`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Extract failed");
        await applyImportedAudio(data.asset as ProjectAsset);
        pushToast("Audio extracted from video", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Extract failed", "error");
      } finally {
        setUploadingMusic(false);
      }
    },
    [applyImportedAudio, projectId, pushToast, setError, setUploadingMusic],
  );

  const onImportYoutubeAudio = useCallback(
    async (url: string) => {
      setUploadingMusic(true);
      setError(null);
      try {
        const res = await fetch(`/api/editor/project/${projectId}/audio-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeUrl: url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "YouTube import failed");
        await applyImportedAudio(data.asset as ProjectAsset);
        pushToast("YouTube audio added", "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "YouTube import failed", "error");
      } finally {
        setUploadingMusic(false);
      }
    },
    [applyImportedAudio, projectId, pushToast, setError, setUploadingMusic],
  );

  const generateLibraryAudio = useCallback(
    async (preset: string, kind: "music" | "sfx") => {
      setUploadingMusic(true);
      try {
        const res = await fetch("/api/ai/music", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, preset }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Generate failed");
        const asset = data.asset as ProjectAsset;
        setAssets((prev) => [...prev, asset]);
        const track: MusicTrack = {
          assetId: asset.id,
          start: kind === "sfx" ? current : 0,
          inPoint: 0,
          outPoint: asset.duration || (kind === "sfx" ? 1 : 8),
          volume: kind === "sfx" ? 0.9 : 0.55,
          fadeIn: kind === "sfx" ? 0.02 : 0.4,
          fadeOut: kind === "sfx" ? 0.05 : 0.8,
          duck: kind === "music" ? 0.7 : 0,
        };
        if (kind === "music" && !music) {
          setMusic(track);
        } else {
          setMusicTracks((prev) => [...prev, track]);
        }
        setTab("audio");
        pushToast(`${asset.name} added`, "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Library audio failed", "error");
      } finally {
        setUploadingMusic(false);
      }
    },
    [
      current,
      music,
      projectId,
      pushToast,
      setAssets,
      setMusic,
      setMusicTracks,
      setTab,
      setUploadingMusic,
    ],
  );

  const patchMusic = useCallback(
    (patch: Partial<MusicTrack>) => {
      setMusic((m) => (m ? { ...m, ...patch } : m));
    },
    [setMusic],
  );

  const patchMusicTrack = useCallback(
    (index: number, patch: Partial<MusicTrack>) => {
      setMusicTracks((prev) =>
        prev.map((t, i) => (i === index ? { ...t, ...patch } : t)),
      );
    },
    [setMusicTracks],
  );

  const removeMusicTrack = useCallback(
    (index: number) => {
      setMusicTracks((prev) => prev.filter((_, i) => i !== index));
    },
    [setMusicTracks],
  );

  return {
    applyImportedAudio,
    onMusicFile,
    onExtractAudioFromVideo,
    onImportYoutubeAudio,
    generateLibraryAudio,
    patchMusic,
    patchMusicTrack,
    removeMusicTrack,
  };
}

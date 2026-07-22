"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { clipLane, textHasContent, type ExportOptions, type MusicTrack, type TextOverlay, type TimelineClip, type TrackChrome, type TrackId } from "@/lib/editor-types";
import type { AspectRatio } from "@/lib/types";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type ExportJob = {
  id: string;
  status: string;
  error?: string;
  previewUrl?: string;
  downloadUrl?: string;
  format?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type StudioExportArgs = {
  projectId: string;
  aspect: AspectRatio;
  freeV1: boolean;
  tracks: Record<TrackId, TrackChrome>;
  rootClipsRef: MutableRefObject<TimelineClip[]>;
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  texts: TextOverlay[];
  exportOpts: ExportOptions;
  activeJobId: string | null;
  setActiveJobId: Dispatch<SetStateAction<string | null>>;
  setExportJobs: Dispatch<SetStateAction<ExportJob[]>>;
  setExporting: Dispatch<SetStateAction<boolean>>;
  setShowExport: Dispatch<SetStateAction<boolean>>;
  setShowGrowthHub: Dispatch<SetStateAction<boolean>>;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setResult: Dispatch<
    SetStateAction<{ downloadUrl: string; previewUrl: string } | null>
  >;
  pushToast: ToastFn;
};

/** Export queue: refresh, start render, cancel, poll to completion. */
export function useStudioExport(args: StudioExportArgs) {
  const {
    projectId,
    aspect,
    freeV1,
    tracks,
    rootClipsRef,
    music,
    musicTracks,
    texts,
    exportOpts,
    activeJobId,
    setActiveJobId,
    setExportJobs,
    setExporting,
    setShowExport,
    setShowGrowthHub,
    setPlaying,
    setError,
    setResult,
    pushToast,
  } = args;

  const refreshExportJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/editor/project/${projectId}/export`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.jobs)) setExportJobs(data.jobs);
    } catch {
      // ignore
    }
  }, [projectId, setExportJobs]);

  const exportVideo = useCallback(async () => {
    setShowExport(false);
    setExporting(true);
    setError(null);
    setResult(null);
    setPlaying(false);
    try {
      const anySolo = Object.values(tracks).some((t) => t.solo);
      const audible = (id: TrackId) => (anySolo ? tracks[id].solo : !tracks[id].muted);
      const visible = (id: TrackId) => !tracks[id].hidden;

      const exportClips = rootClipsRef.current
        .filter((c) => {
          const lane = clipLane(c);
          if (lane === 0) return visible("video");
          if (lane === 1) return visible("overlay");
          return visible("overlay2");
        })
        .map((c) => {
          const lane = clipLane(c);
          const trackId: TrackId =
            lane === 0 ? "video" : lane === 1 ? "overlay" : "overlay2";
          if (!audible(trackId)) return { ...c, volume: 0, linkedAudio: false as const };
          return c;
        });

      const res = await fetch(`/api/editor/project/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aspect,
          clips: exportClips,
          freeMain: freeV1 || undefined,
          music: music && audible("music") ? music : undefined,
          musicTracks: musicTracks.length && audible("music") ? musicTracks : undefined,
          texts: visible("text") ? texts.filter((t) => textHasContent(t)) : [],
          export: exportOpts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export failed");
      const jobId = data.jobId as string;
      setActiveJobId(jobId);
      pushToast("Export queued", "info");
      await refreshExportJobs();

      const deadline = Date.now() + 9 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 600));
        const st = await fetch(
          `/api/editor/project/${projectId}/export?jobId=${encodeURIComponent(jobId)}`,
        );
        const body = await st.json();
        const job = body.job as
          | {
              status: string;
              error?: string;
              downloadUrl?: string;
              previewUrl?: string;
            }
          | undefined;
        if (!job) continue;
        await refreshExportJobs();
        if (job.status === "done") {
          setResult({
            downloadUrl: job.downloadUrl!,
            previewUrl: job.previewUrl!,
          });
          pushToast("Export ready — opening Growth Hub", "success");
          setShowGrowthHub(true);
          return;
        }
        if (job.status === "error") throw new Error(job.error || "Export failed");
        if (job.status === "cancelled") {
          pushToast("Export cancelled", "info");
          return;
        }
      }
      throw new Error("Export timed out — check the queue panel");
    } catch (err) {
      const m = err instanceof Error ? err.message : "Export failed";
      setError(m);
      pushToast(m, "error");
    } finally {
      setExporting(false);
      setActiveJobId(null);
      await refreshExportJobs();
    }
  }, [
    projectId,
    aspect,
    freeV1,
    tracks,
    rootClipsRef,
    music,
    musicTracks,
    texts,
    exportOpts,
    setShowExport,
    setExporting,
    setError,
    setResult,
    setPlaying,
    setActiveJobId,
    pushToast,
    refreshExportJobs,
    setShowGrowthHub,
  ]);

  const cancelExport = useCallback(async () => {
    try {
      const q = activeJobId ? `?jobId=${encodeURIComponent(activeJobId)}` : "";
      await fetch(`/api/editor/project/${projectId}/export${q}`, { method: "DELETE" });
      pushToast("Export cancelled", "info");
      await refreshExportJobs();
    } catch {
      // ignore
    }
  }, [activeJobId, projectId, pushToast, refreshExportJobs]);

  useEffect(() => {
    void refreshExportJobs();
  }, [projectId, refreshExportJobs]);

  return { refreshExportJobs, exportVideo, cancelExport };
}

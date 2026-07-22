"use client";

import { useEffect, type MutableRefObject, type RefObject } from "react";
import { clamp } from "@/lib/edit-tools";
import type { ProjectAsset, TimelineClip, TrackChrome, TrackId } from "@/lib/editor-types";

export type StudioPreviewSyncArgs = {
  videoRef: RefObject<HTMLVideoElement | null>;
  activeAssetRef: MutableRefObject<string | null>;
  activeClip: TimelineClip | null;
  activeAsset: ProjectAsset | null;
  activeLocalT: number;
  activeIndex: number;
  playing: boolean;
  useProxy: boolean;
  masterVolume: number;
  muted: boolean;
  tracks: Record<TrackId, TrackChrome>;
  assetUrl: (a: ProjectAsset, opts?: { full?: boolean }) => string;
};

/** Keep the preview <video> src / seek / rate / volume in sync with the playhead. */
export function useStudioPreviewSync(args: StudioPreviewSyncArgs) {
  const {
    videoRef,
    activeAssetRef,
    activeClip,
    activeAsset,
    activeLocalT,
    activeIndex,
    playing,
    useProxy,
    masterVolume,
    muted,
    tracks,
    assetUrl,
  } = args;

  useEffect(() => {
    const v = videoRef.current;
    if (!activeClip || !activeAsset || !v) return;
    const speed = activeClip.speed || 1;
    const sync = activeClip.multicamSync ?? 0;
    const sourceTime = activeClip.inPoint + sync + activeLocalT * speed;

    if (activeAsset.kind === "video") {
      const url = assetUrl(activeAsset);
      const mediaKey = `${activeAsset.id}:${url}`;
      if (activeAssetRef.current !== mediaKey) {
        activeAssetRef.current = mediaKey;
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          v.removeEventListener("loadeddata", onReady);
          v.removeEventListener("canplay", onReady);
          v.removeEventListener("error", onErr);
        };
        const onReady = () => {
          try {
            v.currentTime = Math.max(0, sourceTime);
          } catch {
            /* ignore seek before ready */
          }
          v.playbackRate = speed;
          if (playing) void v.play().catch(() => {});
          cleanup();
        };
        const onErr = () => {
          if (useProxy && activeAsset.proxyFile && url.includes(activeAsset.proxyFile)) {
            cleanup();
            activeAssetRef.current = null;
            v.src = assetUrl(activeAsset, { full: true });
            v.load();
            return;
          }
          cleanup();
        };
        v.addEventListener("loadeddata", onReady);
        v.addEventListener("canplay", onReady);
        v.addEventListener("error", onErr);
        v.src = url;
        v.load();
        if (v.readyState >= 2) onReady();
      } else {
        if (Math.abs(v.currentTime - sourceTime) > 0.25) {
          try {
            v.currentTime = Math.max(0, sourceTime);
          } catch {
            /* ignore */
          }
        }
        v.playbackRate = speed;
        if (playing && v.paused) void v.play().catch(() => {});
      }
      v.volume = clamp(activeClip.volume * masterVolume, 0, 1);
    } else {
      activeAssetRef.current = null;
      v.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeAsset?.id, activeClip?.id, activeLocalT, playing, useProxy, assetUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && activeClip) v.playbackRate = activeClip.speed || 1;
  }, [activeClip, activeClip?.speed, videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    v.volume = clamp(activeClip.volume * masterVolume, 0, 1);
    if (masterVolume <= 0.001) v.muted = true;
    else if (!muted && !tracks.video.muted) v.muted = false;
  }, [masterVolume, muted, activeClip, tracks.video.muted, videoRef]);
}

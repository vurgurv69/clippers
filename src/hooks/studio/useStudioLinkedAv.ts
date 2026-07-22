"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { MusicTrack, TimelineClip } from "@/lib/editor-types";

export type StudioLinkedAvArgs = {
  nestedEditing: boolean;
  viewClips: TimelineClip[];
  starts: number[];
  music: MusicTrack | null;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
};

/** Keep detached / linked music lanes glued to their source clips. */
export function useStudioLinkedAv(args: StudioLinkedAvArgs) {
  const { nestedEditing, viewClips, starts, music, setMusic, setMusicTracks } = args;

  useEffect(() => {
    if (nestedEditing) return;
    if (!music?.linkedClipId) return;
    const i = viewClips.findIndex((c) => c.id === music.linkedClipId);
    if (i < 0) return;
    const clip = viewClips[i];
    const start = starts[i] ?? 0;
    const nextIn = clip.inPoint;
    const nextOut = clip.outPoint;
    if (
      Math.abs(music.start - start) < 1e-4 &&
      Math.abs(music.inPoint - nextIn) < 1e-4 &&
      Math.abs(music.outPoint - nextOut) < 1e-4
    ) {
      return;
    }
    setMusic((m) =>
      m && m.linkedClipId === clip.id
        ? { ...m, start, inPoint: nextIn, outPoint: nextOut }
        : m,
    );
  }, [
    viewClips,
    starts,
    music?.linkedClipId,
    music?.start,
    music?.inPoint,
    music?.outPoint,
    nestedEditing,
    music,
    setMusic,
  ]);

  useEffect(() => {
    if (nestedEditing) return;
    setMusicTracks((prev) => {
      if (!prev.some((m) => m.linkedClipId)) return prev;
      let changed = false;
      const next = prev.map((m) => {
        if (!m.linkedClipId) return m;
        const i = viewClips.findIndex((c) => c.id === m.linkedClipId);
        if (i < 0) return m;
        const clip = viewClips[i];
        const start = starts[i] ?? 0;
        if (
          Math.abs(m.start - start) < 1e-4 &&
          Math.abs(m.inPoint - clip.inPoint) < 1e-4 &&
          Math.abs(m.outPoint - clip.outPoint) < 1e-4
        ) {
          return m;
        }
        changed = true;
        return { ...m, start, inPoint: clip.inPoint, outPoint: clip.outPoint };
      });
      return changed ? next : prev;
    });
  }, [viewClips, starts, nestedEditing, setMusicTracks]);
}

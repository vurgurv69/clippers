"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  MusicTrack,
  TextOverlay,
  TimelineClip,
  TimelineMarker,
  TrackChrome,
  TrackId,
} from "@/lib/editor-types";

export type StudioSnapshot = {
  clips: TimelineClip[];
  texts: TextOverlay[];
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  tracks: Record<TrackId, TrackChrome>;
  freeV1: boolean;
  markers: TimelineMarker[];
};

export type HistoryEntry = {
  index: number;
  label: string;
  current: boolean;
};

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioHistoryArgs = {
  clips: TimelineClip[];
  texts: TextOverlay[];
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  tracks: Record<TrackId, TrackChrome>;
  freeV1: boolean;
  markers: TimelineMarker[];
  setClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setTexts: Dispatch<SetStateAction<TextOverlay[]>>;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  setTracks: Dispatch<SetStateAction<Record<TrackId, TrackChrome>>>;
  setFreeV1: Dispatch<SetStateAction<boolean>>;
  setMarkers: Dispatch<SetStateAction<TimelineMarker[]>>;
  pushToast: ToastFn;
};

/** Debounced project snapshots + undo / redo / jump. */
export function useStudioHistory(args: StudioHistoryArgs) {
  const {
    clips,
    texts,
    music,
    musicTracks,
    tracks,
    freeV1,
    markers,
    setClips,
    setTexts,
    setMusic,
    setMusicTracks,
    setTracks,
    setFreeV1,
    setMarkers,
    pushToast,
  } = args;

  const historyRef = useRef<{
    stack: StudioSnapshot[];
    index: number;
    applying: boolean;
  }>({
    stack: [],
    index: -1,
    applying: false,
  });
  const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    const h = historyRef.current;
    if (h.applying) {
      h.applying = false;
      return;
    }
    const snap: StudioSnapshot = {
      clips: JSON.parse(JSON.stringify(clips)),
      texts: JSON.parse(JSON.stringify(texts)),
      music: music ? JSON.parse(JSON.stringify(music)) : null,
      musicTracks: JSON.parse(JSON.stringify(musicTracks)),
      tracks: JSON.parse(JSON.stringify(tracks)),
      freeV1,
      markers: JSON.parse(JSON.stringify(markers)),
    };
    const t = setTimeout(() => {
      const cur = h.stack[h.index];
      if (cur && JSON.stringify(cur) === JSON.stringify(snap)) return;
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snap);
      if (h.stack.length > 100) h.stack.shift();
      h.index = h.stack.length - 1;
      setHistoryInfo({ canUndo: h.index > 0, canRedo: false });
      setHistoryTick((n) => n + 1);
    }, 350);
    return () => clearTimeout(t);
  }, [clips, texts, music, musicTracks, tracks, freeV1, markers]);

  const applySnapshot = useCallback(
    (snap: StudioSnapshot) => {
      const h = historyRef.current;
      h.applying = true;
      setClips(JSON.parse(JSON.stringify(snap.clips)));
      setTexts(JSON.parse(JSON.stringify(snap.texts)));
      setMusic(snap.music ? JSON.parse(JSON.stringify(snap.music)) : null);
      setMusicTracks(JSON.parse(JSON.stringify(snap.musicTracks || [])));
      if (snap.tracks) setTracks(JSON.parse(JSON.stringify(snap.tracks)));
      if (typeof snap.freeV1 === "boolean") setFreeV1(snap.freeV1);
      if (snap.markers) setMarkers(JSON.parse(JSON.stringify(snap.markers)));
    },
    [setClips, setFreeV1, setMarkers, setMusic, setMusicTracks, setTexts, setTracks],
  );

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applySnapshot(h.stack[h.index]);
    setHistoryInfo({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
    setHistoryTick((n) => n + 1);
    pushToast("Undo", "info");
  }, [applySnapshot, pushToast]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applySnapshot(h.stack[h.index]);
    setHistoryInfo({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
    setHistoryTick((n) => n + 1);
    pushToast("Redo", "info");
  }, [applySnapshot, pushToast]);

  const jumpHistory = useCallback(
    (index: number) => {
      const h = historyRef.current;
      if (index < 0 || index >= h.stack.length) return;
      h.index = index;
      applySnapshot(h.stack[h.index]);
      setHistoryInfo({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
      setHistoryTick((n) => n + 1);
    },
    [applySnapshot],
  );

  const historyEntries = useMemo((): HistoryEntry[] => {
    void historyTick;
    const h = historyRef.current;
    return h.stack.map((_, i) => ({
      index: i,
      label: i === 0 ? "Project opened" : `Edit ${i}`,
      current: i === h.index,
    }));
  }, [historyTick, clips, texts, music, markers]);

  return {
    historyInfo,
    historyEntries,
    undo,
    redo,
    jumpHistory,
  };
}

"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  clipLane,
  clipLength,
  type MusicTrack,
  type TextOverlay,
  type TimelineClip,
  type TrackChrome,
  type TrackId,
} from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

type ClipboardPayload =
  | { type: "clip"; data: TimelineClip }
  | { type: "text"; data: TextOverlay }
  | null;

export type StudioSelectionArgs = {
  fps: number;
  viewClips: TimelineClip[];
  starts: number[];
  current: number;
  selectedId: string | null;
  selectedIds: string[];
  selectedClip: TimelineClip | null;
  selectedText: TextOverlay | null;
  selectedTextId: string | null;
  texts: TextOverlay[];
  freeV1: boolean;
  rippleEnabled: boolean;
  magnetic: boolean;
  tracks: Record<TrackId, TrackChrome>;
  clipboardRef: MutableRefObject<ClipboardPayload>;
  curRef: MutableRefObject<number>;
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSelectedTextId: Dispatch<SetStateAction<string | null>>;
  setTexts: Dispatch<SetStateAction<TextOverlay[]>>;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  deleteText: (id: string) => void;
  pushToast: ToastFn;
};

/** Multi-select, clip CRUD, lane moves, and copy/cut/paste clipboard. */
export function useStudioSelection(args: StudioSelectionArgs) {
  const {
    fps,
    viewClips,
    starts,
    current,
    selectedId,
    selectedIds,
    selectedClip,
    selectedText,
    selectedTextId,
    texts,
    freeV1,
    rippleEnabled,
    magnetic,
    tracks,
    clipboardRef,
    curRef,
    setViewClips,
    setSelectedId,
    setSelectedIds,
    setSelectedTextId,
    setTexts,
    setMusic,
    setMusicTracks,
    patchClip,
    deleteText,
    pushToast,
  } = args;

  const selectClip = useCallback(
    (id: string, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => {
      const ctrl = Boolean(e?.ctrlKey || e?.metaKey);
      const shift = Boolean(e?.shiftKey);
      setSelectedTextId(null);
      if (ctrl) {
        setSelectedIds((prev) => {
          const has = prev.includes(id);
          const next = has ? prev.filter((x) => x !== id) : [...prev, id];
          setSelectedId(next[next.length - 1] ?? null);
          return next;
        });
        return;
      }
      if (shift && selectedId) {
        const a = viewClips.findIndex((c) => c.id === selectedId);
        const b = viewClips.findIndex((c) => c.id === id);
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          const range = viewClips.slice(lo, hi + 1).map((c) => c.id);
          setSelectedIds(range);
          setSelectedId(id);
          return;
        }
      }
      setSelectedId(id);
      setSelectedIds([id]);
    },
    [selectedId, setSelectedId, setSelectedIds, setSelectedTextId, viewClips],
  );

  const deleteClip = useCallback(
    (id: string) => {
      const victims = selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
      setViewClips((prev) => {
        const removed = prev.filter((c) => victims.includes(c.id));
        let next = prev.filter((c) => !victims.includes(c.id));
        if (!rippleEnabled || !removed.length) return next;

        for (const victim of removed) {
          const lane = clipLane(victim);
          if (lane === 0 && !freeV1) continue;
          const vStart = Math.max(0, victim.tlStart ?? 0);
          const vLen = clipLength(victim);
          const vEnd = vStart + vLen;
          next = next.map((c) => {
            if (clipLane(c) !== lane) return c;
            const s = Math.max(0, c.tlStart ?? 0);
            if (s + 1e-4 >= vEnd) return { ...c, tlStart: Math.max(0, s - vLen) };
            return c;
          });
        }
        return next;
      });
      setSelectedIds((prev) => prev.filter((x) => !victims.includes(x)));
      setSelectedId((sid) => (sid && victims.includes(sid) ? null : sid));
      setMusic((m) => (m?.linkedClipId && victims.includes(m.linkedClipId) ? null : m));
      setMusicTracks((prev) =>
        prev.filter((m) => !(m.linkedClipId && victims.includes(m.linkedClipId))),
      );
    },
    [
      freeV1,
      rippleEnabled,
      selectedIds,
      setMusic,
      setMusicTracks,
      setSelectedId,
      setSelectedIds,
      setViewClips,
    ],
  );

  const duplicateClip = useCallback(
    (id: string) => {
      const targets = selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
      setViewClips((prev) => {
        const next = [...prev];
        let insertAt = next.length;
        for (let i = next.length - 1; i >= 0; i--) {
          if (targets.includes(next[i].id)) {
            insertAt = i + 1;
            break;
          }
        }
        const copies = targets
          .map((tid) => next.find((c) => c.id === tid))
          .filter((c): c is TimelineClip => Boolean(c))
          .map((c) => ({
            ...c,
            id: uid("clip"),
            color: { ...c.color },
            effects: (c.effects || []).map((f) => ({ ...f, id: uid("fx") })),
          }));
        next.splice(insertAt, 0, ...copies);
        if (copies[0]) {
          setSelectedId(copies[0].id);
          setSelectedIds(copies.map((c) => c.id));
        }
        return next;
      });
    },
    [selectedIds, setSelectedId, setSelectedIds, setViewClips],
  );

  const moveClip = useCallback(
    (id: string, dir: -1 | 1) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip) return;
      if (clipLane(clip) > 0) {
        const chrome = clipLane(clip) >= 2 ? tracks.overlay2 : tracks.overlay;
        if (chrome.locked) {
          pushToast(`${chrome.name} is locked`, "info");
          return;
        }
        const i = viewClips.findIndex((c) => c.id === id);
        const step = magnetic ? 0.1 : 1 / fps;
        patchClip(id, { tlStart: Math.max(0, (starts[i] ?? 0) + dir * step) });
        return;
      }
      if (tracks.video.locked) {
        pushToast("Video track is locked", "info");
        return;
      }
      setViewClips((prev) => {
        const mains = prev.filter((c) => clipLane(c) === 0);
        const ovs = prev.filter((c) => clipLane(c) > 0);
        const i = mains.findIndex((c) => c.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= mains.length) return prev;
        const nextMains = [...mains];
        [nextMains[i], nextMains[j]] = [nextMains[j], nextMains[i]];
        return [...nextMains, ...ovs];
      });
    },
    [fps, magnetic, patchClip, pushToast, setViewClips, starts, tracks, viewClips],
  );

  const moveClipToLane = useCallback(
    (clipId: string, lane: number) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip) return;
      const i = viewClips.findIndex((c) => c.id === clipId);
      const start = starts[i] ?? current;
      if (lane === 0) {
        setViewClips((prev) => {
          const rest = prev.filter((c) => c.id !== clipId);
          const mains = rest.filter((c) => clipLane(c) === 0);
          const ovs = rest.filter((c) => clipLane(c) > 0);
          const moved: TimelineClip = { ...clip, lane: 0, tlStart: undefined };
          return [...mains, moved, ...ovs];
        });
        pushToast("Moved to V1 Main", "success");
      } else {
        setViewClips((prev) =>
          prev.map((c) =>
            c.id === clipId ? { ...c, lane, tlStart: start, transition: "none" as const } : c,
          ),
        );
        pushToast(lane >= 2 ? "Moved to V3 Overlay" : "Moved to V2 Overlay", "success");
      }
    },
    [current, pushToast, setViewClips, starts, viewClips],
  );

  const copySelection = useCallback(() => {
    if (selectedText) {
      clipboardRef.current = { type: "text", data: JSON.parse(JSON.stringify(selectedText)) };
      pushToast("Text copied", "success");
    } else if (selectedClip) {
      clipboardRef.current = { type: "clip", data: JSON.parse(JSON.stringify(selectedClip)) };
      pushToast("Clip copied", "success");
    }
  }, [clipboardRef, pushToast, selectedClip, selectedText]);

  const cutSelection = useCallback(() => {
    if (!selectedText && !selectedClip) return;
    copySelection();
    if (selectedTextId) deleteText(selectedTextId);
    else if (selectedId) deleteClip(selectedId);
  }, [
    copySelection,
    deleteClip,
    deleteText,
    selectedClip,
    selectedId,
    selectedText,
    selectedTextId,
  ]);

  const pasteClipboard = useCallback(() => {
    const c = clipboardRef.current;
    if (!c) return;
    if (c.type === "clip") {
      const copy: TimelineClip = { ...c.data, id: uid("clip"), color: { ...c.data.color } };
      setViewClips((prev) => {
        const i = prev.findIndex((x) => x.id === selectedId);
        const idx = i >= 0 ? i + 1 : prev.length;
        const n = [...prev];
        n.splice(idx, 0, copy);
        return n;
      });
      setSelectedId(copy.id);
      pushToast("Clip pasted", "success");
    } else {
      const copy: TextOverlay = { ...c.data, id: uid("txt"), start: curRef.current };
      setTexts((prev) => [...prev, copy]);
      setSelectedTextId(copy.id);
      pushToast("Text pasted", "success");
    }
  }, [
    clipboardRef,
    curRef,
    pushToast,
    selectedId,
    setSelectedId,
    setSelectedTextId,
    setTexts,
    setViewClips,
  ]);

  const duplicateSelection = useCallback(() => {
    if (selectedTextId) {
      const t = texts.find((x) => x.id === selectedTextId);
      if (t) {
        const copy: TextOverlay = { ...t, id: uid("txt"), start: t.start + t.duration };
        setTexts((prev) => [...prev, copy]);
        setSelectedTextId(copy.id);
      }
    } else if (selectedId) {
      duplicateClip(selectedId);
    }
  }, [duplicateClip, selectedId, selectedTextId, setSelectedTextId, setTexts, texts]);

  return {
    selectClip,
    deleteClip,
    duplicateClip,
    moveClip,
    moveClipToLane,
    copySelection,
    cutSelection,
    pasteClipboard,
    duplicateSelection,
  };
}

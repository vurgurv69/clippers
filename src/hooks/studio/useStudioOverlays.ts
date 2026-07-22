"use client";

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import {
  clipLane,
  clipLength,
  defaultText,
  type ClipKeyframe,
  type ClipTransform,
  type MusicTrack,
  type ProjectAsset,
  type TextOverlay,
  type TimelineClip,
  type TransitionKind,
} from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";
import { activeMainIndex } from "@/lib/studio-timeline";
import type { InspectorTab } from "@/components/editor/StudioInspector";
import type { SidebarTab } from "@/components/editor/StudioSidebar";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioOverlaysArgs = {
  projectId: string;
  current: number;
  viewClips: TimelineClip[];
  starts: number[];
  selectedId: string | null;
  selectedClip: TimelineClip | null;
  previewTransition: TransitionKind;
  rippleEnabled: boolean;
  music: MusicTrack | null;
  assetById: Map<string, ProjectAsset>;
  setPreviewTransition: Dispatch<SetStateAction<TransitionKind>>;
  setTexts: Dispatch<SetStateAction<TextOverlay[]>>;
  setSelectedTextId: Dispatch<SetStateAction<string | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
  setTab: Dispatch<SetStateAction<InspectorTab>>;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  setError: Dispatch<SetStateAction<string | null>>;
  seek: (t: number) => void;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  addAssetToTimeline: (asset: ProjectAsset, opts?: { lane?: number }) => void;
  pushToast: ToastFn;
};

/** Text / stickers, transitions, clip motion presets, linked A/V. */
export function useStudioOverlays(args: StudioOverlaysArgs) {
  const {
    projectId,
    current,
    viewClips,
    starts,
    selectedId,
    selectedClip,
    previewTransition,
    rippleEnabled,
    music,
    assetById,
    setPreviewTransition,
    setTexts,
    setSelectedTextId,
    setSelectedId,
    setSelectedIds,
    setSidebarTab,
    setTab,
    setAssets,
    setMusic,
    setMusicTracks,
    setError,
    seek,
    patchClip,
    addAssetToTimeline,
    pushToast,
  } = args;

  useEffect(() => {
    if (selectedClip && selectedClip.transition !== "none") {
      setPreviewTransition(selectedClip.transition);
    }
    // Mirror selected clip transition into the browser — intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const addText = useCallback(() => {
    const t = defaultText(uid("txt"), current);
    t.anim = "none";
    setTexts((prev) => [...prev, t]);
    setSelectedTextId(t.id);
    setSidebarTab("ai");
    setTab("text");
    pushToast("Text on screen — edit it in the inspector", "success");
  }, [current, pushToast, setSelectedTextId, setSidebarTab, setTab, setTexts]);

  const insertTextStyle = useCallback(
    (style: Partial<TextOverlay>, label: string) => {
      const t = { ...defaultText(uid("txt"), current), ...style };
      if (!style.text) t.text = label;
      if (!style.anim) t.anim = "none";
      setTexts((prev) => [...prev, t]);
      setSelectedTextId(t.id);
      setSidebarTab("ai");
      setTab("text");
      pushToast(`${label} on screen`, "success");
    },
    [current, pushToast, setSelectedTextId, setSidebarTab, setTab, setTexts],
  );

  const patchText = useCallback(
    (id: string, patch: Partial<TextOverlay>) => {
      setTexts((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next: TextOverlay = { ...t, ...patch };
          if ("fontFile" in patch && !patch.fontFile) {
            delete next.fontFile;
          }
          if (typeof next.text !== "string" || next.text.length === 0) {
            next.text = t.text || "Your text";
          }
          return next;
        }),
      );
    },
    [setTexts],
  );

  const deleteText = useCallback(
    (id: string) => {
      setTexts((prev) => {
        const victim = prev.find((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (!rippleEnabled || !victim) return next;
        return next.map((t) =>
          t.start >= victim.start + victim.duration
            ? { ...t, start: Math.max(0, t.start - victim.duration) }
            : t,
        );
      });
      setSelectedTextId((s) => (s === id ? null : s));
    },
    [rippleEnabled, setSelectedTextId, setTexts],
  );

  const addSticker = useCallback(
    (glyph: string) => {
      const t = defaultText(uid("stk"), current);
      t.text = glyph;
      t.size = 0.16;
      t.duration = 2.5;
      t.bold = false;
      t.stroke = 0;
      t.anim = "none";
      t.font = "Segoe UI Emoji";
      setTexts((prev) => [...prev, t]);
      setSelectedTextId(t.id);
      setSelectedId(null);
      setTab("text");
      pushToast("Sticker added", "success");
    },
    [current, pushToast, setSelectedId, setSelectedTextId, setTab, setTexts],
  );

  const addPackSticker = useCallback(
    async (src: string, label: string) => {
      const isLottie = src.endsWith(".json");
      if (isLottie) {
        const t = defaultText(uid("stk"), current);
        t.text = label;
        t.size = 0.18;
        t.duration = 3;
        t.bold = false;
        t.stroke = 0;
        t.anim = "fade";
        t.stickerUrl = src;
        t.stickerLottie = true;
        setTexts((prev) => [...prev, t]);
        setSelectedTextId(t.id);
        setSidebarTab("ai");
        setTab("clip");
        pushToast(`${label} Lottie sticker added`, "success");
        return;
      }
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("Sticker missing");
        const blob = await res.blob();
        const file = new File([blob], `${label.replace(/\s+/g, "-").toLowerCase()}.svg`, {
          type: blob.type || "image/svg+xml",
        });
        const form = new FormData();
        form.append("file", file);
        const up = await fetch(`/api/editor/project/${projectId}/asset`, {
          method: "POST",
          body: form,
        });
        const data = await up.json();
        if (!up.ok) throw new Error(data.error || "Upload failed");
        const asset = data.asset as ProjectAsset;
        setAssets((prev) => [...prev, asset]);
        addAssetToTimeline(asset, { lane: 1 });
        pushToast(`${label} sticker on V2`, "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Sticker failed", "error");
      }
    },
    [
      addAssetToTimeline,
      current,
      projectId,
      pushToast,
      setAssets,
      setSelectedTextId,
      setSidebarTab,
      setTab,
      setTexts,
    ],
  );

  const orderedMainClips = useCallback(() => {
    return viewClips
      .map((c, i) => ({ c, i, s: starts[i] ?? 0 }))
      .filter(
        (r) =>
          clipLane(r.c) === 0 &&
          !r.c.adjustment &&
          !(r.c.multicamId && !r.c.multicamActive),
      )
      .sort((a, b) => a.s - b.s || a.i - b.i);
  }, [starts, viewClips]);

  const resolveOutgoingClip = useCallback(
    (
      preferredId?: string | null,
    ): { clip: TimelineClip; end: number; next: TimelineClip } | null => {
      const mains = orderedMainClips();
      if (mains.length < 2) return null;

      if (preferredId) {
        const k = mains.findIndex((m) => m.c.id === preferredId);
        if (k >= 0 && k < mains.length - 1) {
          return {
            clip: mains[k].c,
            end: mains[k].s + clipLength(mains[k].c),
            next: mains[k + 1].c,
          };
        }
      }

      for (let k = 0; k < mains.length - 1; k++) {
        const end = mains[k].s + clipLength(mains[k].c);
        if (
          Math.abs(current - end) <= 0.55 ||
          (current >= end - 0.55 && current <= end + 0.15)
        ) {
          return { clip: mains[k].c, end, next: mains[k + 1].c };
        }
      }

      const sel = preferredId || selectedId;
      if (sel) {
        const k = mains.findIndex((m) => m.c.id === sel);
        if (k >= 0 && k < mains.length - 1) {
          return {
            clip: mains[k].c,
            end: mains[k].s + clipLength(mains[k].c),
            next: mains[k + 1].c,
          };
        }
        if (k > 0) {
          return {
            clip: mains[k - 1].c,
            end: mains[k - 1].s + clipLength(mains[k - 1].c),
            next: mains[k].c,
          };
        }
      }

      const ai = activeMainIndex(viewClips, starts, current);
      if (ai >= 0) {
        const k = mains.findIndex((m) => m.i === ai);
        if (k >= 0 && k < mains.length - 1) {
          return {
            clip: mains[k].c,
            end: mains[k].s + clipLength(mains[k].c),
            next: mains[k + 1].c,
          };
        }
      }

      return {
        clip: mains[0].c,
        end: mains[0].s + clipLength(mains[0].c),
        next: mains[1].c,
      };
    },
    [current, orderedMainClips, selectedId, starts, viewClips],
  );

  const applyTransitionKind = useCallback(
    (kind: TransitionKind, duration?: number, outgoingId?: string) => {
      const junction = resolveOutgoingClip(outgoingId);
      if (!junction) {
        pushToast("Need 2 video clips on the Video timeline to add a transition", "info");
        return;
      }
      const dur = duration ?? (junction.clip.transitionDuration || 0.5);
      setPreviewTransition(kind);
      setSelectedId(junction.clip.id);
      setSelectedIds([junction.clip.id]);
      patchClip(junction.clip.id, {
        transition: kind,
        transitionDuration: dur,
      });
      if (kind !== "none") {
        seek(Math.max(0, junction.end - dur * 0.55));
      }
      pushToast(
        kind === "none" ? "Hard cut" : `${kind} applied between clips`,
        "success",
      );
    },
    [
      patchClip,
      pushToast,
      resolveOutgoingClip,
      seek,
      setPreviewTransition,
      setSelectedId,
      setSelectedIds,
    ],
  );

  const onTransitionJunction = useCallback(
    (outgoingId: string) => {
      const junction = resolveOutgoingClip(outgoingId);
      if (!junction) return;
      setSelectedId(junction.clip.id);
      setSelectedIds([junction.clip.id]);
      setSidebarTab("transitions");
      setTab("transitions");
      const kind =
        junction.clip.transition !== "none"
          ? junction.clip.transition
          : previewTransition !== "none"
            ? previewTransition
            : "crossfade";
      const dur = junction.clip.transitionDuration || 0.5;
      if (junction.clip.transition === "none") {
        applyTransitionKind(kind, dur, outgoingId);
      } else {
        seek(Math.max(0, junction.end - dur * 0.55));
        pushToast(`${junction.clip.transition} — pick another in Transitions`, "info");
      }
    },
    [
      applyTransitionKind,
      previewTransition,
      pushToast,
      resolveOutgoingClip,
      seek,
      setSelectedId,
      setSelectedIds,
      setSidebarTab,
      setTab,
    ],
  );

  const applyTransition = useCallback(() => {
    if (!selectedClip) {
      setError("Select a clip first, then apply the transition.");
      return;
    }
    patchClip(selectedClip.id, { transition: previewTransition });
    setError(null);
  }, [patchClip, previewTransition, selectedClip, setError]);

  const applyClipAnimation = useCallback(
    (anim: "none" | "fade" | "slide" | "pop" | "zoom", label: string) => {
      const clip =
        selectedClip ||
        viewClips[activeMainIndex(viewClips, starts, current)] ||
        viewClips[0];
      if (!clip) {
        pushToast("Select a clip to animate", "info");
        return;
      }
      if (!selectedClip) {
        setSelectedId(clip.id);
        setSelectedIds([clip.id]);
      }
      if (anim === "none") {
        patchClip(clip.id, { keyframes: [] });
        pushToast("Animation cleared", "success");
        return;
      }
      const mk = (t: number, props: Partial<ClipTransform>): ClipKeyframe => ({
        id: uid("kf"),
        t,
        ease: "easeInOut",
        ...props,
      });
      let keys: ClipKeyframe[] = [];
      if (anim === "fade") {
        keys = [
          mk(0, { opacity: 0 }),
          mk(0.15, { opacity: 1 }),
          mk(0.85, { opacity: 1 }),
          mk(1, { opacity: 0 }),
        ];
      } else if (anim === "slide") {
        keys = [mk(0, { x: -0.35, opacity: 0 }), mk(0.2, { x: 0, opacity: 1 })];
      } else if (anim === "zoom") {
        keys = [mk(0, { scaleX: 1.25, scaleY: 1.25 }), mk(1, { scaleX: 1, scaleY: 1 })];
      } else if (anim === "pop") {
        keys = [
          mk(0, { scaleX: 0.6, scaleY: 0.6, opacity: 0 }),
          mk(0.18, { scaleX: 1.08, scaleY: 1.08, opacity: 1 }),
          mk(0.32, { scaleX: 1, scaleY: 1 }),
        ];
      }
      patchClip(clip.id, { keyframes: keys });
      setTab("effects");
      pushToast(`${label} applied to clip`, "success");
    },
    [
      current,
      patchClip,
      pushToast,
      selectedClip,
      setSelectedId,
      setSelectedIds,
      setTab,
      starts,
      viewClips,
    ],
  );

  const detachClipAudio = useCallback(
    (clipId?: string) => {
      const id = clipId || selectedId;
      const clip = viewClips.find((c) => c.id === id);
      const asset = clip ? assetById.get(clip.assetId) : null;
      if (!clip || !asset || asset.kind !== "video" || !asset.hasAudio) {
        pushToast("Select a video clip that has audio", "info");
        return;
      }
      const i = viewClips.findIndex((c) => c.id === clip.id);
      const start = starts[i] || 0;
      const vol = clip.volume > 0.01 ? clip.volume : 1;
      const lane: MusicTrack = {
        assetId: asset.id,
        start,
        inPoint: clip.inPoint,
        outPoint: Math.min(clip.outPoint, asset.duration || clip.outPoint),
        volume: vol,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        linkedClipId: clip.id,
      };
      if (music) {
        setMusicTracks((prev) => [...prev, lane]);
      } else {
        setMusic(lane);
      }
      patchClip(clip.id, { volume: 0, linkedAudio: false });
      setSidebarTab("media");
      setTab("audio");
      pushToast("Audio linked on music lane — follows this clip", "success");
    },
    [
      assetById,
      music,
      patchClip,
      pushToast,
      selectedId,
      setMusic,
      setMusicTracks,
      setSidebarTab,
      setTab,
      starts,
      viewClips,
    ],
  );

  const relinkClipAudio = useCallback(
    (clipId?: string) => {
      const id = clipId || selectedId || music?.linkedClipId;
      if (!id || !music?.linkedClipId || music.linkedClipId !== id) {
        pushToast("No linked audio for this clip", "info");
        return;
      }
      patchClip(id, { volume: music.volume || 1, linkedAudio: true });
      setMusic(null);
      pushToast("Audio re-linked to clip", "success");
    },
    [music, patchClip, pushToast, selectedId, setMusic],
  );

  return {
    addText,
    insertTextStyle,
    patchText,
    deleteText,
    addSticker,
    addPackSticker,
    applyTransitionKind,
    onTransitionJunction,
    applyTransition,
    applyClipAnimation,
    detachClipAudio,
    relinkClipAudio,
  };
}

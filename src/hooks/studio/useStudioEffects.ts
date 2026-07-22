"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { clamp } from "@/lib/edit-tools";
import {
  clipLength,
  defaultEffect,
  DEFAULT_TRANSFORM,
  EFFECT_DEFS,
  type BezierHandles,
  type ClipEffect,
  type ClipKeyframe,
  type EffectKind,
  type KeyframeEase,
  type KeyframeProp,
  type TimelineClip,
} from "@/lib/editor-types";
import { uid } from "@/lib/studio-clip-ops";

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioEffectsArgs = {
  viewClips: TimelineClip[];
  starts: number[];
  current: number;
  activeIndex: number;
  defaultEase: KeyframeEase;
  defaultBezier: BezierHandles;
  kfClipboardRef: MutableRefObject<ClipKeyframe[] | null>;
  setDefaultEase: Dispatch<SetStateAction<KeyframeEase>>;
  setDefaultBezier: Dispatch<SetStateAction<BezierHandles>>;
  setViewClips: Dispatch<SetStateAction<TimelineClip[]>>;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  pushToast: ToastFn;
};

/** Keyframe + FX stack mutations for the inspector / shortcuts. */
export function useStudioEffects(args: StudioEffectsArgs) {
  const {
    viewClips,
    starts,
    current,
    activeIndex,
    defaultEase,
    defaultBezier,
    kfClipboardRef,
    setDefaultEase,
    setDefaultBezier,
    setViewClips,
    patchClip,
    pushToast,
  } = args;

  const addKeyframe = useCallback(
    (id: string, prop: KeyframeProp) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip || activeIndex < 0 || viewClips[activeIndex]?.id !== id) {
        pushToast("Scrub onto the clip, then add a keyframe", "info");
        return;
      }
      const len = clipLength(clip);
      const local = clamp(current - (starts[activeIndex] || 0), 0, len);
      const t = len > 0 ? local / len : 0;
      const tr = { ...DEFAULT_TRANSFORM, ...(clip.transform || {}) };
      const valueMap: Record<KeyframeProp, number> = {
        opacity: tr.opacity,
        volume: clip.volume,
        x: tr.x,
        y: tr.y,
        scaleX: tr.scaleX,
        scaleY: tr.scaleY,
        rotation: tr.rotation,
        brightness: clip.color.brightness,
      };
      const keys = [...(clip.keyframes || [])];
      const near = keys.findIndex((k) => Math.abs(k.t - t) < 0.02);
      const kf: ClipKeyframe = {
        id: near >= 0 ? keys[near].id : uid("kf"),
        t,
        [prop]: valueMap[prop],
        ease: defaultEase,
        bezier: defaultEase === "bezier" ? ([...defaultBezier] as BezierHandles) : undefined,
      };
      if (near >= 0) keys[near] = { ...keys[near], ...kf };
      else keys.push(kf);
      keys.sort((a, b) => a.t - b.t);
      patchClip(id, { keyframes: keys });
      pushToast(`${prop} keyframe (${defaultEase})`, "success");
    },
    [
      activeIndex,
      current,
      defaultBezier,
      defaultEase,
      patchClip,
      pushToast,
      starts,
      viewClips,
    ],
  );

  const setAllKeyframeEase = useCallback(
    (id: string, ease: KeyframeEase, bezier?: BezierHandles, quiet = false) => {
      const clip = viewClips.find((c) => c.id === id);
      const bez = bezier || defaultBezier;
      setDefaultEase(ease);
      if (bezier) setDefaultBezier(bezier);
      if (!clip?.keyframes?.length) return;
      patchClip(id, {
        keyframes: clip.keyframes.map((k) => ({
          ...k,
          ease,
          bezier: ease === "bezier" ? ([...bez] as BezierHandles) : undefined,
        })),
      });
      if (!quiet) pushToast(`Ease → ${ease}`, "success");
    },
    [defaultBezier, patchClip, pushToast, setDefaultBezier, setDefaultEase, viewClips],
  );

  const removeNearbyKeyframe = useCallback(
    (id: string) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip || activeIndex < 0) return;
      const len = clipLength(clip);
      const t = len > 0 ? clamp(current - (starts[activeIndex] || 0), 0, len) / len : 0;
      const keys = (clip.keyframes || []).filter((k) => Math.abs(k.t - t) > 0.02);
      patchClip(id, { keyframes: keys });
    },
    [activeIndex, current, patchClip, starts, viewClips],
  );

  const moveKeyframe = useCallback(
    (clipId: string, kfId: string, nextT: number) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip) return;
      const keys = (clip.keyframes || []).map((k) =>
        k.id === kfId ? { ...k, t: clamp(nextT, 0, 1) } : k,
      );
      keys.sort((a, b) => a.t - b.t);
      patchClip(clipId, { keyframes: keys });
    },
    [patchClip, viewClips],
  );

  const copyKeyframes = useCallback(
    (clipId: string) => {
      const clip = viewClips.find((c) => c.id === clipId);
      if (!clip?.keyframes?.length) {
        pushToast("No keyframes to copy", "info");
        return;
      }
      kfClipboardRef.current = JSON.parse(JSON.stringify(clip.keyframes));
      pushToast("Keyframes copied", "success");
    },
    [kfClipboardRef, pushToast, viewClips],
  );

  const pasteKeyframes = useCallback(
    (clipId: string) => {
      if (!kfClipboardRef.current?.length) {
        pushToast("No keyframes on clipboard", "info");
        return;
      }
      const pasted = kfClipboardRef.current.map((k) => ({
        ...k,
        id: uid("kf"),
      }));
      patchClip(clipId, { keyframes: pasted });
      pushToast("Keyframes pasted", "success");
    },
    [kfClipboardRef, patchClip, pushToast],
  );

  const setEffects = useCallback(
    (id: string, next: ClipEffect[]) => {
      setViewClips((prev) => prev.map((c) => (c.id === id ? { ...c, effects: next } : c)));
    },
    [setViewClips],
  );

  const addEffect = useCallback(
    (id: string, kind: EffectKind) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip) return;
      const list = [...(clip.effects || []), defaultEffect(kind, uid("fx"))];
      setEffects(id, list);
      pushToast(`${EFFECT_DEFS.find((d) => d.kind === kind)?.label || "Effect"} added`, "success");
    },
    [pushToast, setEffects, viewClips],
  );

  const updateEffect = useCallback(
    (id: string, fxId: string, patch: Partial<ClipEffect>) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip) return;
      setEffects(
        id,
        (clip.effects || []).map((f) => (f.id === fxId ? { ...f, ...patch } : f)),
      );
    },
    [setEffects, viewClips],
  );

  const removeEffect = useCallback(
    (id: string, fxId: string) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip) return;
      setEffects(id, (clip.effects || []).filter((f) => f.id !== fxId));
    },
    [setEffects, viewClips],
  );

  const moveEffect = useCallback(
    (id: string, fxId: string, dir: -1 | 1) => {
      const clip = viewClips.find((c) => c.id === id);
      if (!clip?.effects) return;
      const list = [...clip.effects];
      const i = list.findIndex((f) => f.id === fxId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      setEffects(id, list);
    },
    [setEffects, viewClips],
  );

  return {
    addKeyframe,
    setAllKeyframeEase,
    removeNearbyKeyframe,
    moveKeyframe,
    copyKeyframes,
    pasteKeyframes,
    setEffects,
    addEffect,
    updateEffect,
    removeEffect,
    moveEffect,
  };
}

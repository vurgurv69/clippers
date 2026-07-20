import fs from "fs";
import path from "path";

const dir = "src/components/editor";
const outDir = path.join(dir, "inspector");
fs.mkdirSync(outDir, { recursive: true });

function load(name) {
  return fs.readFileSync(path.join(dir, `_extract_${name}.txt`), "utf8");
}

function dedent(s) {
  const lines = s.replace(/\r\n/g, "\n").split("\n");
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => (l.match(/^(\s*)/) || ["", ""])[1].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines
    .map((l) => l.slice(min))
    .join("\n")
    .trim();
}

function extractInner(src, tab) {
  const s = src.replace(/\r\n/g, "\n");
  const m = s.match(new RegExp(`\\{tab === "${tab}" &&\\s*([\\s\\S]+)\\}\\s*$`));
  if (!m) throw new Error("no match for " + tab);
  let inner = m[1].trim();
  if (inner.startsWith("(") && inner.endsWith(")")) {
    inner = inner.slice(1, -1).trim();
  }
  return dedent(inner);
}

function extractTernaryTrue(s) {
  // selectedClip ? ( JSX ) : ( JSX )
  const m = s.match(/^selectedClip \?\s*\(([\s\S]*)\)\s*:\s*\(([\s\S]*)\)\s*$/);
  if (m) return dedent(m[1]);
  if (s.startsWith("selectedClip ?")) {
    const open = s.indexOf("(");
    if (open >= 0) {
      // find matching close before " : "
      let depth = 0;
      for (let i = open; i < s.length; i++) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") {
          depth--;
          if (depth === 0) {
            return dedent(s.slice(open + 1, i));
          }
        }
      }
    }
  }
  return s;
}

function indent(s, n) {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((l) => (l.trim() ? pad + l : l))
    .join("\n");
}

const panels = ["effects", "transform", "fx", "audio", "text", "transitions"];
const inners = {};
for (const p of panels) {
  inners[p] = extractInner(load(p), p);
  console.log(p, "→", inners[p].slice(0, 50).replace(/\n/g, " "));
}

// Split actions from transitions extract (actions were in same line range end)
let actionsJsx = null;
const fullTransitionsExtract = load("transitions");
const actionsMatch = fullTransitionsExtract.match(
  /\{selectedClip && tab !== "text" &&\s*([\s\S]*?)\}\s*$/,
);
if (actionsMatch) {
  actionsJsx = dedent(actionsMatch[1]);
  // remove from transitions inner if present
  const idx = inners.transitions.indexOf("{selectedClip && tab !==");
  if (idx >= 0) inners.transitions = inners.transitions.slice(0, idx).trim();
}

const effectsBody = extractTernaryTrue(inners.effects);
const transformBody = extractTernaryTrue(inners.transform);
const fxBody = extractTernaryTrue(inners.fx);

// audio/text/transitions are already the <div className="tool">...</div>
const audioBody = inners.audio;
const textBody = inners.text;
const transitionsBody = inners.transitions;

const out = `"use client";

import type { MutableRefObject } from "react";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";
import { BezierEditor } from "@/components/editor/BezierEditor";
import { TransitionChip, TransitionDemo } from "@/components/editor/TransitionWidgets";
import {
  COLOR_PRESETS,
  DEFAULT_TRANSFORM,
  EFFECT_DEFS,
  KEYFRAME_EASES,
  STICKER_PRESETS,
  TEXT_FONTS,
  TEXT_TEMPLATES,
  TRANSITION_DEFS,
  clipLane,
  type BezierHandles,
  type EffectKind,
  type KeyframeEase,
  type KeyframeProp,
  type MusicTrack,
  type ProjectAsset,
  type TextAlign,
  type TextAnim,
  type TextOverlay,
  type TextTransform,
  type TimelineClip,
  type TransitionKind,
} from "@/lib/editor-types";

const TRANSITIONS = TRANSITION_DEFS;

export type InspectorPanelCtx = {
  projectId: string;
  tab: string;
  selectedClip: TimelineClip | null;
  selectedAsset: ProjectAsset | null;
  selectedIds: string[];
  selectedText: TextOverlay | null;
  assets: ProjectAsset[];
  assetById: Map<string, ProjectAsset>;
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  musicAsset: ProjectAsset | undefined;
  total: number;
  uploadingMusic: boolean;
  fxSearch: string;
  setFxSearch: (v: string) => void;
  trSearch: string;
  setTrSearch: (v: string) => void;
  favTr: TransitionKind[];
  previewTransition: TransitionKind;
  setPreviewTransition: (t: TransitionKind) => void;
  demoKey: number;
  setDemoKey: (fn: (k: number) => number) => void;
  defaultEase: KeyframeEase;
  defaultBezier: BezierHandles;
  setDefaultBezier: (b: BezierHandles) => void;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  patchColor: (id: string, patch: Partial<TimelineClip["color"]>) => void;
  patchTransform: (id: string, patch: Record<string, number>) => void;
  patchMusic: (patch: Partial<MusicTrack>) => void;
  patchText: (id: string, patch: Partial<TextOverlay>) => void;
  setMusic: (
    m: MusicTrack | null | ((prev: MusicTrack | null) => MusicTrack | null),
  ) => void;
  setMusicTracks: (fn: (prev: MusicTrack[]) => MusicTrack[]) => void;
  setAssets: (fn: (prev: ProjectAsset[]) => ProjectAsset[]) => void;
  addKeyframe: (clipId: string, prop: KeyframeProp) => void;
  removeNearbyKeyframe: (clipId: string) => void;
  copyKeyframes: (clipId: string) => void;
  pasteKeyframes: (clipId: string) => void;
  setAllKeyframeEase: (
    clipId: string,
    ease: KeyframeEase,
    bezier?: BezierHandles,
    onlyBezier?: boolean,
  ) => void;
  addEffect: (clipId: string, kind: EffectKind) => void;
  updateEffect: (
    clipId: string,
    fxId: string,
    patch: Partial<{ enabled: boolean; amount: number }>,
  ) => void;
  moveEffect: (clipId: string, fxId: string, dir: -1 | 1) => void;
  removeEffect: (clipId: string, fxId: string) => void;
  detachClipAudio: (clipId: string) => void;
  relinkClipAudio: (clipId: string | undefined) => void;
  onMusicFile: (f: File) => void;
  addText: () => void;
  addSticker: (glyph: string) => void;
  deleteText: (id: string) => void;
  applyTransition: () => void;
  toggleFav: (id: TransitionKind) => void;
  moveClip: (id: string, dir: -1 | 1) => void;
  duplicateClip: (id: string) => void;
  moveClipToLane: (id: string, lane: number) => void;
  deleteClip: (id: string) => void;
  pushToast: (msg: string, kind?: "info" | "success" | "error") => void;
  gradeClipboardRef: MutableRefObject<TimelineClip["color"] | null>;
};

function usePanel(ctx: InspectorPanelCtx) {
  return ctx;
}

export function EffectsPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    selectedIds,
    projectId,
    patchClip,
    patchColor,
    addKeyframe,
    setAssets,
    pushToast,
    gradeClipboardRef,
  } = useBag(ctx);
  if (!selectedClip) {
    return <p className="tool-hint">Select a clip on the timeline.</p>;
  }
  return (
${indent(effectsBody, 4)}
  );
}

export function TransformPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    patchClip,
    patchTransform,
    addKeyframe,
    removeNearbyKeyframe,
    copyKeyframes,
    pasteKeyframes,
    setAllKeyframeEase,
    defaultEase,
    defaultBezier,
    setDefaultBezier,
  } = useBag(ctx);
  if (!selectedClip) {
    return <p className="tool-hint">Select a clip on the timeline.</p>;
  }
  return (
${indent(transformBody, 4)}
  );
}

export function FxPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    fxSearch,
    setFxSearch,
    addEffect,
    updateEffect,
    moveEffect,
    removeEffect,
  } = useBag(ctx);
  if (!selectedClip) {
    return <p className="tool-hint">Select a clip on the timeline.</p>;
  }
  return (
${indent(fxBody, 4)}
  );
}

export function AudioPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    selectedAsset,
    music,
    musicAsset,
    musicTracks,
    assetById,
    total,
    uploadingMusic,
    projectId,
    patchClip,
    patchMusic,
    setMusic,
    setMusicTracks,
    setAssets,
    addKeyframe,
    detachClipAudio,
    relinkClipAudio,
    onMusicFile,
    pushToast,
  } = useBag(ctx);
  return (
${indent(audioBody, 4)}
  );
}

export function TextPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedText,
    assets,
    projectId,
    addText,
    addSticker,
    patchText,
    deleteText,
    setAssets,
    pushToast,
  } = useBag(ctx);
  return (
${indent(textBody, 4)}
  );
}

export function TransitionsPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    trSearch,
    setTrSearch,
    favTr,
    previewTransition,
    setPreviewTransition,
    demoKey,
    setDemoKey,
    applyTransition,
    toggleFav,
    patchClip,
  } = useBag(ctx);
  return (
${indent(transitionsBody, 4)}
  );
}

export function InspectorClipActions({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    tab,
    moveClip,
    duplicateClip,
    moveClipToLane,
    deleteClip,
  } = useBag(ctx);
  if (!selectedClip || tab === "text") return null;
  return (
${indent(actionsJsx || `<div className="inspector-actions" />`, 4)}
  );
}

export function InspectorTabPanels({ ctx }: { ctx: InspectorPanelCtx }) {
  const { tab } = ctx;
  return (
    <>
      {tab === "effects" && <EffectsPanel ctx={ctx} />}
      {tab === "transform" && <TransformPanel ctx={ctx} />}
      {tab === "fx" && <FxPanel ctx={ctx} />}
      {tab === "audio" && <AudioPanel ctx={ctx} />}
      {tab === "text" && <TextPanel ctx={ctx} />}
      {tab === "transitions" && <TransitionsPanel ctx={ctx} />}
      <InspectorClipActions ctx={ctx} />
    </>
  );
}
`;

const outPath = path.join(outDir, "InspectorTabPanels.tsx");
fs.writeFileSync(outPath, out);
console.log("wrote", outPath, "bytes", out.length);

// cleanup extract temps
for (const p of panels) {
  try {
    fs.unlinkSync(path.join(dir, `_extract_${p}.txt`));
  } catch {
    // ignore
  }
}
console.log("cleaned extracts");

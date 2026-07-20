import fs from "fs";

const srcPath = "src/components/editor/StudioEditor.tsx";
const lines = fs.readFileSync(srcPath, "utf8").split(/\r?\n/);

const start = 2130;
const end = 2616;
const chunk = lines.slice(start - 1, end).join("\n");
if (!chunk.includes("studio-timeline") || !chunk.includes("</section>")) {
  throw new Error("Unexpected timeline slice");
}

const openRe =
  /^\s*<section className=\{`studio-timeline\$\{expanded \? " expanded" : ""\}`\}>\s*/;
let inner = chunk.replace(openRe, "");
inner = inner.replace(/\s*<\/section>\s*$/, "").trim();

const header = `"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { ClipStrip } from "@/components/editor/ClipStrip";
import { TrackHeader, type TrackChrome } from "@/components/editor/TrackHeader";
import { TimelineMinimap } from "@/components/editor/TimelineMinimap";
import {
  clipLane,
  clipLength,
  type MusicTrack,
  type ProjectAsset,
  type TextOverlay,
  type TimelineClip,
} from "@/lib/editor-types";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export type TimelineTracks = {
  video: TrackChrome;
  overlay: TrackChrome;
  music: TrackChrome;
  text: TrackChrome;
};

export type TimelineCtx = {
  expanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  total: number;
  current: number;
  fmt: (t: number) => string;
  snapEnabled: boolean;
  setSnapEnabled: Dispatch<SetStateAction<boolean>>;
  magnetic: boolean;
  setMagnetic: Dispatch<SetStateAction<boolean>>;
  rippleEnabled: boolean;
  setRippleEnabled: Dispatch<SetStateAction<boolean>>;
  pxPerSec: number;
  setPxPerSec: Dispatch<SetStateAction<number>>;
  trackRef: RefObject<HTMLDivElement | null>;
  setViewScroll: Dispatch<SetStateAction<{ left: number; width: number }>>;
  timelineWidth: number;
  minorTicks: number[];
  ticks: number[];
  snapSec: (t: number) => number;
  timeFromClientX: (x: number) => number;
  seek: (t: number) => void;
  splitAtPlayhead: () => void;
  tracks: TimelineTracks;
  patchTrack: (id: keyof TimelineTracks, patch: Partial<TrackChrome>) => void;
  clips: TimelineClip[];
  starts: number[];
  marquee: { x0: number; x1: number } | null;
  setMarquee: Dispatch<SetStateAction<{ x0: number; x1: number } | null>>;
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  selectedTextId: string | null;
  setSelectedTextId: Dispatch<SetStateAction<string | null>>;
  setTab: (tab: string) => void;
  pushToast: (msg: string, kind?: "info" | "success" | "error") => void;
  clipInView: (leftPx: number, widthPx: number) => boolean;
  assetById: Map<string, ProjectAsset>;
  selectClip: (id: string, e?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  setCtxMenu: Dispatch<SetStateAction<{ x: number; y: number; clipId: string } | null>>;
  reorderTo: (id: string, idx: number) => void;
  thumbUrl: (a: ProjectAsset, t: number, w?: number) => string;
  waveformUrl: (a: ProjectAsset, w?: number, h?: number) => string;
  moveKeyframe: (clipId: string, kfId: string, t: number) => void;
  dragHandle: (clientX: number, onDelta: (d: number) => void) => void;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  music: MusicTrack | null;
  musicAsset: ProjectAsset | undefined;
  patchMusic: (patch: Partial<MusicTrack>) => void;
  texts: TextOverlay[];
  patchText: (id: string, patch: Partial<TextOverlay>) => void;
};

export function StudioTimeline({ ctx }: { ctx: TimelineCtx }) {
  const {
    expanded,
    setExpanded,
    total,
    current,
    fmt,
    snapEnabled,
    setSnapEnabled,
    magnetic,
    setMagnetic,
    rippleEnabled,
    setRippleEnabled,
    pxPerSec,
    setPxPerSec,
    trackRef,
    setViewScroll,
    timelineWidth,
    minorTicks,
    ticks,
    snapSec,
    timeFromClientX,
    seek,
    splitAtPlayhead,
    tracks,
    patchTrack,
    clips,
    starts,
    marquee,
    setMarquee,
    selectedIds,
    setSelectedIds,
    setSelectedId,
    selectedTextId,
    setSelectedTextId,
    setTab,
    pushToast,
    clipInView,
    assetById,
    selectClip,
    setCtxMenu,
    reorderTo,
    thumbUrl,
    waveformUrl,
    moveKeyframe,
    dragHandle,
    patchClip,
    music,
    musicAsset,
    patchMusic,
    texts,
    patchText,
  } = ctx;

  return (
    <section className={\`studio-timeline\${expanded ? " expanded" : ""}\`}>
`;

const footer = `
    </section>
  );
}
`;

const body = inner
  .split("\n")
  .map((l) => "      " + l)
  .join("\n");

const out = header + body + footer;
fs.writeFileSync("src/components/editor/StudioTimeline.tsx", out);
console.log("wrote StudioTimeline.tsx", out.split("\n").length, "lines");
console.log("inner starts:", inner.slice(0, 80).replace(/\n/g, " "));

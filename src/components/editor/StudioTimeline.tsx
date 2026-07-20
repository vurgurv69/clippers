"use client";

import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from "react";
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
  type TimelineMarker,
} from "@/lib/editor-types";
import type { ToolId } from "@/lib/edit-tools";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function SpeedMenu({
  rate,
  onSetRate,
}: {
  rate: number;
  onSetRate?: (r: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="tl-speed-menu" ref={ref}>
      <button
        type="button"
        className="btn tiny"
        onClick={() => setOpen((v) => !v)}
        title="Playback speed"
      >
        {rate}× ▾
      </button>
      {open && (
        <div className="tl-speed-pop" role="menu">
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
            <button
              key={r}
              type="button"
              role="menuitem"
              className={rate === r ? "on" : undefined}
              onClick={() => {
                onSetRate?.(r);
                setOpen(false);
              }}
            >
              {r}×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type TimelineTracks = {
  video: TrackChrome;
  overlay: TrackChrome;
  overlay2: TrackChrome;
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
  freeV1: boolean;
  onToggleFreeV1: () => void;
  rippleEnabled: boolean;
  setRippleEnabled: Dispatch<SetStateAction<boolean>>;
  pxPerSec: number;
  setPxPerSec: Dispatch<SetStateAction<number>>;
  /** Playback rate — lives on the timeline toolbar (not transport). */
  rate?: number;
  onSetRate?: (r: number) => void;
  trackRef: RefObject<HTMLDivElement | null>;
  setViewScroll: Dispatch<SetStateAction<{ left: number; width: number }>>;
  timelineWidth: number;
  minorTicks: number[];
  ticks: number[];
  snapSec: (t: number) => number;
  timeFromClientX: (x: number) => number;
  seek: (t: number) => void;
  splitAtPlayhead: () => void;
  /** Split a specific clip at a timeline time (blade tool). */
  splitClipAt: (clipId: string, timelineT: number) => void;
  tool: ToolId;
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
  setTab: (
    tab:
      | "clip"
      | "color"
      | "effects"
      | "transform"
      | "animation"
      | "fx"
      | "audio"
      | "text"
      | "transitions",
  ) => void;
  pushToast: (msg: string, kind?: "info" | "success" | "error") => void;
  clipInView: (leftPx: number, widthPx: number) => boolean;
  assetById: Map<string, ProjectAsset>;
  selectClip: (id: string, e?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  setCtxMenu: Dispatch<SetStateAction<{ x: number; y: number; clipId: string } | null>>;
  reorderTo: (id: string, idx: number) => void;
  thumbUrl: (a: ProjectAsset, t: number, w?: number) => string;
  waveformUrl: (a: ProjectAsset, w?: number, h?: number) => string;
  moveKeyframe: (clipId: string, kfId: string, t: number) => void;
  dragHandle: (clientX: number, onDelta: (d: number) => void, onUp?: () => void) => void;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  /** Seed packed mains with tlStart and enable free layout for magnetic drag. */
  beginMagneticDrag?: (clipId: string) => void;
  endMagneticDrag?: (clipId: string) => void;
  rippleMagneticWhileDrag?: (clipId: string, start: number) => void;
  /** Slip source window keeping duration. */
  slipClip: (clipId: string, deltaTimeline: number) => void;
  /** Trim left/right with optional ripple / roll behavior from active tool. */
  trimClipEdge: (
    clipId: string,
    edge: "left" | "right",
    deltaTimeline: number,
    mode: "normal" | "ripple" | "roll",
  ) => void;
  music: MusicTrack | null;
  musicAsset: ProjectAsset | undefined;
  patchMusic: (patch: Partial<MusicTrack>) => void;
  musicTracks: MusicTrack[];
  patchMusicTrack: (index: number, patch: Partial<MusicTrack>) => void;
  removeMusicTrack: (index: number) => void;
  markers: TimelineMarker[];
  onSeekMarker: (t: number) => void;
  texts: TextOverlay[];
  patchText: (id: string, patch: Partial<TextOverlay>) => void;
  nestDepth?: number;
  onExitCompound?: () => void;
  onEnterCompound?: (clipId: string) => void;
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
    freeV1,
    onToggleFreeV1,
    rippleEnabled,
    setRippleEnabled,
    pxPerSec,
    setPxPerSec,
    rate = 1,
    onSetRate,
    trackRef,
    setViewScroll,
    timelineWidth,
    minorTicks,
    ticks,
    snapSec,
    timeFromClientX,
    seek,
    splitAtPlayhead,
    splitClipAt,
    tool,
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
    beginMagneticDrag,
    endMagneticDrag,
    rippleMagneticWhileDrag,
    slipClip,
    trimClipEdge,
    music,
    musicAsset,
    patchMusic,
    musicTracks,
    patchMusicTrack,
    removeMusicTrack,
    markers,
    onSeekMarker,
    texts,
    patchText,
    nestDepth = 0,
    onExitCompound,
    onEnterCompound,
  } = ctx;

  const trimMode = (): "normal" | "ripple" | "roll" => {
    if (tool === "roll") return "roll";
    if (tool === "ripple" || (tool === "trim" && rippleEnabled)) return "ripple";
    if (rippleEnabled && tool === "select") return "ripple";
    return "normal";
  };

  const onClipBodyDown = (
    e: ReactPointerEvent,
    c: TimelineClip,
    i: number,
    locked: boolean,
    lockMsg: string,
    lane: number,
  ) => {
    if (locked) {
      pushToast(lockMsg, "info");
      return;
    }
    if (tool === "blade") {
      e.preventDefault();
      e.stopPropagation();
      selectClip(c.id, e);
      const t = snapSec(timeFromClientX(e.clientX));
      seek(t);
      splitClipAt(c.id, t);
      return;
    }
    if (tool === "zoom") {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.altKey || e.shiftKey ? 0.8 : 1.25;
      setPxPerSec((p) => clamp(Math.round(p * factor), 20, 400));
      return;
    }
    if (tool === "hand") return; // pan handled on scroll container
    selectClip(c.id, e);
    if (tool === "trim" || tool === "ripple" || tool === "roll") {
      // Select only — edge edits use handles
      return;
    }
    if (tool === "slip") {
      dragHandle(e.clientX, (d) => slipClip(c.id, d));
      return;
    }
    if (tool === "slide" || lane > 0) {
      const base = c.tlStart ?? starts[i] ?? 0;
      dragHandle(e.clientX, (d) => {
        patchClip(c.id, { tlStart: snapSec(base + d) });
      });
      return;
    }
    // select tool (and default): magnetic / free / reorder
    if (freeV1 || (magnetic && !freeV1)) {
      if (magnetic && !freeV1) beginMagneticDrag?.(c.id);
      const base = c.tlStart ?? starts[i] ?? 0;
      dragHandle(
        e.clientX,
        (d) => {
          const next = snapSec(base + d);
          if (magnetic && rippleMagneticWhileDrag) {
            rippleMagneticWhileDrag(c.id, next);
          } else {
            patchClip(c.id, { tlStart: next });
          }
        },
        () => {
          if (magnetic && !freeV1) endMagneticDrag?.(c.id);
        },
      );
      return;
    }
    const startX = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) > 6) moved = true;
      if (moved) {
        const t = timeFromClientX(ev.clientX);
        let idx = 0;
        let acc = 0;
        const mains = clips.filter((x) => clipLane(x) === 0);
        for (let k = 0; k < mains.length; k++) {
          if (acc <= t) idx = k;
          acc += clipLength(mains[k]);
        }
        reorderTo(c.id, idx);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onEdgeDown = (
    e: ReactPointerEvent,
    c: TimelineClip,
    edge: "left" | "right",
  ) => {
    e.stopPropagation();
    if (tool === "blade" || tool === "hand" || tool === "zoom" || tool === "slip") return;
    dragHandle(e.clientX, (d) => trimClipEdge(c.id, edge, d, trimMode()));
  };

  return (
    <section className={`studio-timeline${expanded ? " expanded" : ""}`}>
      <div className="timeline-bar">
                  <div className="timeline-tools left">
                    <span className="timeline-label">
                      {nestDepth > 0 ? `Compound · ${fmt(total)}` : `Timeline · ${fmt(total)}`}
                    </span>
                    {nestDepth > 0 && onExitCompound && (
                      <button
                        className="btn tiny on"
                        onClick={onExitCompound}
                        title="Exit compound — return to parent timeline"
                      >
                        Exit compound{nestDepth > 1 ? ` (${nestDepth})` : ""}
                      </button>
                    )}
                  </div>
                  {/* Dedicated timeline toolbar — Snap / Magnet / Ripple / Zoom / height / speed */}
                  <div className="timeline-tools timeline-pro-tools" role="toolbar" aria-label="Timeline options">
                    <button
                      className={snapEnabled ? "btn tiny on" : "btn tiny"}
                      onClick={() => setSnapEnabled((s) => !s)}
                      title="Edge snapping"
                    >
                      Snap
                    </button>
                    <button
                      className={magnetic ? "btn tiny on" : "btn tiny"}
                      onClick={() => setMagnetic((m) => !m)}
                      title="Magnetic: drag snaps edges and closes gaps on release"
                    >
                      Magnet
                    </button>
                    <button
                      className={rippleEnabled ? "btn tiny on" : "btn tiny"}
                      onClick={() => setRippleEnabled((r) => !r)}
                      title="Ripple edit — close gaps when deleting"
                    >
                      Ripple
                    </button>
                    <button
                      className={freeV1 ? "btn tiny on" : "btn tiny"}
                      onClick={onToggleFreeV1}
                      title="Free-place V1 clips vs gapless pack"
                    >
                      {freeV1 ? "Free V1" : "Pack V1"}
                    </button>
                    <span className="toolbar-divider" aria-hidden />
                    <label className="tl-zoom" title="Timeline zoom (Ctrl + wheel)">
                      <span>Zoom</span>
                      <input
                        className="zoom-slider"
                        type="range"
                        min={24}
                        max={400}
                        step={1}
                        value={pxPerSec}
                        onChange={(e) => setPxPerSec(Number(e.target.value))}
                        aria-label="Timeline zoom"
                      />
                    </label>
                    <button
                      className="btn tiny"
                      onClick={() => setExpanded((e) => !e)}
                      title={expanded ? "Compact track height" : "Tall track height"}
                    >
                      {expanded ? "Compact" : "Tall"}
                    </button>
                    <span className="toolbar-divider" aria-hidden />
                    <SpeedMenu rate={rate} onSetRate={onSetRate} />
                  </div>
                </div>
      
                <div
                  className="timeline-scroll"
                  ref={trackRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setViewScroll({ left: el.scrollLeft, width: el.clientWidth });
                  }}
                  onPointerDown={(e) => {
                    if (tool === "hand") {
                      const el = trackRef.current;
                      if (!el) return;
                      e.preventDefault();
                      const x0 = e.clientX;
                      const s0 = el.scrollLeft;
                      const move = (ev: PointerEvent) => {
                        el.scrollLeft = s0 - (ev.clientX - x0);
                      };
                      const up = () => {
                        window.removeEventListener("pointermove", move);
                        window.removeEventListener("pointerup", up);
                      };
                      window.addEventListener("pointermove", move);
                      window.addEventListener("pointerup", up);
                    }
                  }}
                >
                  <div className="timeline-inner" style={{ width: timelineWidth }}>
                    <div
                      className="ruler"
                      onPointerDown={(e) => {
                        if (tool === "hand") return;
                        if (tool === "zoom") {
                          e.stopPropagation();
                          const factor = e.altKey || e.shiftKey ? 0.8 : 1.25;
                          setPxPerSec((p) => clamp(Math.round(p * factor), 20, 400));
                          return;
                        }
                        seek(snapSec(timeFromClientX(e.clientX)));
                      }}
                    >                      {minorTicks.map((t) => (
                        <span key={`m${t}`} className="tick-minor" style={{ left: t * pxPerSec }} />
                      ))}
                      {ticks.map((t) => (
                        <span key={t} className="tick" style={{ left: t * pxPerSec }}>
                          {fmt(t).replace(/\.\d$/, "")}
                        </span>
                      ))}
                    </div>

                    {markers.length > 0 && (
                      <div className="marker-rail" aria-label="Timeline markers">
                        {markers.map((mk) => (
                          <button
                            key={mk.id}
                            type="button"
                            className="marker-tick"
                            style={{
                              left: mk.t * pxPerSec,
                              ["--mk" as string]: mk.color || "#e2a03f",
                            }}
                            data-label={mk.label}
                            title={`${mk.label} · ${fmt(mk.t)}`}
                            onClick={() => onSeekMarker(mk.t)}
                          />
                        ))}
                      </div>
                    )}
      
                    {/* V1 MAIN video track */}
                    <TrackHeader
                      track={tracks.video}
                      onPatch={(p) => patchTrack("video", p)}
                      count={clips.filter((c) => clipLane(c) === 0).length}
                    />
                    {!tracks.video.hidden && (
                    <div
                      className="track track-clips"
                      style={{ height: tracks.video.collapsed ? 12 : tracks.video.height, opacity: tracks.video.muted ? 0.55 : 1 }}
                      onPointerDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (tracks.video.locked) return;
                        if (tool === "hand" || tool === "blade") return;
                        if (tool === "zoom") {
                          const factor = e.altKey || e.shiftKey ? 0.8 : 1.25;
                          setPxPerSec((p) => clamp(Math.round(p * factor), 20, 400));
                          return;
                        }
                        const el = trackRef.current;
                        if (!el) return;
                        const rect = el.getBoundingClientRect();
                        const x0 = e.clientX - rect.left + el.scrollLeft;
                        setMarquee({ x0, x1: x0 });
                        setSelectedIds([]);
                        setSelectedId(null);
                        const move = (ev: PointerEvent) => {
                          const x1 = ev.clientX - rect.left + el.scrollLeft;
                          setMarquee({ x0, x1 });
                        };
                        const up = (ev: PointerEvent) => {
                          window.removeEventListener("pointermove", move);
                          window.removeEventListener("pointerup", up);
                          const x1 = ev.clientX - rect.left + el.scrollLeft;
                          const lo = Math.min(x0, x1) / pxPerSec;
                          const hi = Math.max(x0, x1) / pxPerSec;
                          setMarquee(null);
                          if (Math.abs(x1 - x0) < 4) return;
                          const hit = clips
                            .map((c, i) => ({ c, i, a: starts[i], b: starts[i] + clipLength(c) }))
                            .filter((r) => clipLane(r.c) === 0 && r.b > lo && r.a < hi)
                            .map((r) => r.c.id);
                          if (hit.length) {
                            setSelectedIds(hit);
                            setSelectedId(hit[hit.length - 1]);
                            pushToast(`${hit.length} clip${hit.length === 1 ? "" : "s"} selected`, "info");
                          }
                        };
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", up);
                      }}
                    >
                      {marquee && (
                        <div
                          className="marquee"
                          style={{
                            left: Math.min(marquee.x0, marquee.x1),
                            width: Math.max(2, Math.abs(marquee.x1 - marquee.x0)),
                          }}
                        />
                      )}
                      {clips.map((c, i) => {
                        if (clipLane(c) !== 0) return null;
                        const asset = assetById.get(c.assetId);
                        const len = clipLength(c);
                        const left = starts[i] * pxPerSec;
                        const width = len * pxPerSec;
                        if (!clipInView(left, width)) {
                          return (
                            <div
                              key={c.id}
                              className="clip-block ghost"
                              style={{ left, width, borderColor: tracks.video.color }}
                              aria-hidden
                            />
                          );
                        }
                        const maxOut = asset?.kind === "image" ? 30 : asset?.duration ?? c.outPoint;
                        const isOn = selectedIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`clip-block${isOn ? " on" : ""}${c.adjustment ? " adjustment" : ""}${c.compound ? " compound" : ""}${c.multicamId ? " multicam" : ""}${c.multicamActive ? " live" : ""}${c.multicamId && !c.multicamActive ? " mc-inactive" : ""}`}
                            style={{
                              left,
                              width,
                              borderColor: tracks.video.color,
                              opacity: c.multicamId && !c.multicamActive ? 0.35 : undefined,
                              zIndex: c.multicamId && !c.multicamActive ? 0 : 1,
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              selectClip(c.id, e);
                              setCtxMenu({ x: e.clientX, y: e.clientY, clipId: c.id });
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (c.compound && c.children?.length && onEnterCompound) {
                                onEnterCompound(c.id);
                              }
                            }}
                            onPointerDown={(e) =>
                              onClipBodyDown(e, c, i, tracks.video.locked, "Video track is locked", 0)
                            }
                          >
                            {asset && (asset.kind === "video" || asset.kind === "image") && (
                              <ClipStrip asset={asset} clip={c} width={width} url={thumbUrl} />
                            )}
                            {asset?.kind === "video" && asset.hasAudio && width > 48 && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                className="wave-img clip-wave"
                                src={waveformUrl(asset, Math.min(800, Math.round(width)), 28)}
                                alt=""
                                draggable={false}
                              />
                            )}
                            {(c.keyframes || []).map((kf) => (
                              <span
                                key={kf.id}
                                className="kf-diamond"
                                style={{ left: `${clamp(kf.t, 0, 1) * 100}%` }}
                                title={`Keyframe @ ${(kf.t * 100).toFixed(0)}% — drag to move`}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const clipEl = (e.currentTarget as HTMLElement).parentElement;
                                  if (!clipEl) return;
                                  const move = (ev: PointerEvent) => {
                                    const rect = clipEl.getBoundingClientRect();
                                    const t = clamp((ev.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
                                    moveKeyframe(c.id, kf.id, t);
                                  };
                                  const up = () => {
                                    window.removeEventListener("pointermove", move);
                                    window.removeEventListener("pointerup", up);
                                  };
                                  window.addEventListener("pointermove", move);
                                  window.addEventListener("pointerup", up);
                                }}
                              />
                            ))}
                            {c.transition !== "none" && (
                              <span className="clip-balloon">{c.transition}</span>
                            )}
                            <span
                              className="clip-handle left"
                              onPointerDown={(e) => onEdgeDown(e, c, "left")}
                            />
                            <span className="clip-label">
                              {c.compound
                                ? `▣ CMP (${c.children?.length || 0})`
                                : c.multicamId
                                  ? `${c.multicamActive ? "●" : "○"} ${asset?.name?.slice(0, 12) || "cam"}`
                                  : (
                                    <>
                                      {asset?.kind === "image" ? "🖼" : "🎬"}{" "}
                                      {asset?.name?.slice(0, 14) || "clip"}
                                    </>
                                  )}
                              {(c.speed || 1) !== 1 && <em className="tr-badge">{c.speed}×</em>}
                              {music?.linkedClipId === c.id && <em className="tr-badge">A/V</em>}
                              {c.linkedAudio === false && music?.linkedClipId !== c.id && (
                                <em className="tr-badge">muted</em>
                              )}
                              {(c.effects || []).some((f) => f.enabled) && (
                                <em className="tr-badge fx">fx {(c.effects || []).filter((f) => f.enabled).length}</em>
                              )}
                            </span>
                            <span
                              className="clip-handle right"
                              onPointerDown={(e) => onEdgeDown(e, c, "right")}
                            />
                          </div>
                        );
                      })}
                    </div>
                    )}
      
                    {/* V2 OVERLAY track (lane 1) */}
                    <TrackHeader
                      track={tracks.overlay}
                      onPatch={(p) => patchTrack("overlay", p)}
                      count={clips.filter((c) => clipLane(c) === 1).length}
                    />
                    {!tracks.overlay.hidden && (
                    <div
                      className="track track-clips overlay-lane"
                      style={{ height: tracks.overlay.collapsed ? 12 : tracks.overlay.height, opacity: tracks.overlay.muted ? 0.55 : 1 }}
                    >
                      {clips.map((c, i) => {
                        if (clipLane(c) !== 1) return null;
                        const asset = assetById.get(c.assetId);
                        const len = clipLength(c);
                        const left = starts[i] * pxPerSec;
                        const width = len * pxPerSec;
                        if (!clipInView(left, width)) {
                          return (
                            <div
                              key={c.id}
                              className="clip-block overlay ghost"
                              style={{ left, width, borderColor: tracks.overlay.color }}
                              aria-hidden
                            />
                          );
                        }
                        const maxOut = asset?.kind === "image" ? 30 : asset?.duration ?? c.outPoint;
                        const isOn = selectedIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`clip-block overlay${isOn ? " on" : ""}${c.adjustment ? " adjustment" : ""}`}
                            style={{ left, width, borderColor: tracks.overlay.color }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              selectClip(c.id, e);
                              setCtxMenu({ x: e.clientX, y: e.clientY, clipId: c.id });
                            }}
                            onPointerDown={(e) =>
                              onClipBodyDown(e, c, i, tracks.overlay.locked, "V2 track is locked", 1)
                            }
                          >
                            {asset && (asset.kind === "video" || asset.kind === "image") && (
                              <ClipStrip asset={asset} clip={c} width={width} url={thumbUrl} />
                            )}
                            <span
                              className="clip-handle left"
                              onPointerDown={(e) => onEdgeDown(e, c, "left")}
                            />
                            <span className="clip-label">
                              {c.adjustment ? "▨ ADJ" : `▣ ${asset?.name?.slice(0, 12) || "V2"}`}
                            </span>
                            <span
                              className="clip-handle right"
                              onPointerDown={(e) => onEdgeDown(e, c, "right")}
                            />
                          </div>
                        );
                      })}
                      {clips.every((c) => clipLane(c) !== 1) && (
                        <span className="lane-empty">Move a clip here → V2 Overlay</span>
                      )}
                    </div>
                    )}

                    {/* V3 OVERLAY track (lane ≥ 2) */}
                    <TrackHeader
                      track={tracks.overlay2}
                      onPatch={(p) => patchTrack("overlay2", p)}
                      count={clips.filter((c) => clipLane(c) >= 2).length}
                    />
                    {!tracks.overlay2.hidden && (
                    <div
                      className="track track-clips overlay-lane"
                      style={{ height: tracks.overlay2.collapsed ? 12 : tracks.overlay2.height, opacity: tracks.overlay2.muted ? 0.55 : 1 }}
                    >
                      {clips.map((c, i) => {
                        if (clipLane(c) < 2) return null;
                        const asset = assetById.get(c.assetId);
                        const len = clipLength(c);
                        const left = starts[i] * pxPerSec;
                        const width = len * pxPerSec;
                        if (!clipInView(left, width)) {
                          return (
                            <div
                              key={c.id}
                              className="clip-block overlay ghost"
                              style={{ left, width, borderColor: tracks.overlay2.color }}
                              aria-hidden
                            />
                          );
                        }
                        const maxOut = asset?.kind === "image" ? 30 : asset?.duration ?? c.outPoint;
                        const isOn = selectedIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`clip-block overlay${isOn ? " on" : ""}${c.adjustment ? " adjustment" : ""}`}
                            style={{ left, width, borderColor: tracks.overlay2.color }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              selectClip(c.id, e);
                              setCtxMenu({ x: e.clientX, y: e.clientY, clipId: c.id });
                            }}
                            onPointerDown={(e) =>
                              onClipBodyDown(e, c, i, tracks.overlay2.locked, "V3 track is locked", 2)
                            }
                          >
                            {asset && (asset.kind === "video" || asset.kind === "image") && (
                              <ClipStrip asset={asset} clip={c} width={width} url={thumbUrl} />
                            )}
                            <span
                              className="clip-handle left"
                              onPointerDown={(e) => onEdgeDown(e, c, "left")}
                            />
                            <span className="clip-label">
                              {c.adjustment ? "▨ ADJ" : `▣ ${asset?.name?.slice(0, 12) || "V3"}`}
                            </span>
                            <span
                              className="clip-handle right"
                              onPointerDown={(e) => onEdgeDown(e, c, "right")}
                            />
                          </div>
                        );
                      })}
                      {clips.every((c) => clipLane(c) < 2) && (
                        <span className="lane-empty">Move a clip here → V3 Overlay</span>
                      )}
                    </div>
                    )}
      
                    {/* AUDIO track */}
                    <TrackHeader
                      track={tracks.music}
                      onPatch={(p) => patchTrack("music", p)}
                      count={(music ? 1 : 0) + musicTracks.length}
                    />
                    {!tracks.music.hidden && (
                    <div
                      className="track track-audio"
                      style={{ height: tracks.music.collapsed ? 12 : tracks.music.height, opacity: tracks.music.muted ? 0.55 : 1 }}
                    >
                      {music && musicAsset ? (
                        <div
                          className="audio-block"
                          style={{
                            left: music.start * pxPerSec,
                            width: Math.max(24, (music.outPoint - music.inPoint) * pxPerSec),
                            borderColor: tracks.music.color,
                          }}
                          onPointerDown={(e) => {
                            if (tracks.music.locked) {
                              pushToast("Music track is locked", "info");
                              return;
                            }
                            setTab("audio");
                            const base = music.start;
                            dragHandle(e.clientX, (d) => patchMusic({ start: snapSec(base + d) }));
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className="wave-img" src={waveformUrl(musicAsset)} alt="" draggable={false} />
                          <span
                            className="clip-handle left"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const base = music.inPoint;
                              dragHandle(e.clientX, (d) =>
                                patchMusic({ inPoint: clamp(base + d, 0, music.outPoint - 0.5) }),
                              );
                            }}
                          />
                          <span className="clip-label">♪ {musicAsset.name.slice(0, 18)}</span>
                          <span
                            className="clip-handle right"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const base = music.outPoint;
                              dragHandle(e.clientX, (d) =>
                                patchMusic({
                                  outPoint: clamp(base + d, music.inPoint + 0.5, musicAsset.duration || base + d),
                                }),
                              );
                            }}
                          />
                        </div>
                      ) : null}
                      {musicTracks.map((m, i) => {
                        const a = assetById.get(m.assetId);
                        return (
                          <div
                            key={`sfx-${m.assetId}-${i}`}
                            className="audio-block sfx"
                            style={{
                              left: m.start * pxPerSec,
                              width: Math.max(24, (m.outPoint - m.inPoint) * pxPerSec),
                              borderColor: tracks.music.color,
                            }}
                            onPointerDown={(e) => {
                              if (tracks.music.locked) {
                                pushToast("Music track is locked", "info");
                                return;
                              }
                              setTab("audio");
                              const base = m.start;
                              dragHandle(e.clientX, (d) =>
                                patchMusicTrack(i, { start: snapSec(base + d) }),
                              );
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              removeMusicTrack(i);
                              pushToast("SFX lane removed", "info");
                            }}
                          >
                            {a ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="wave-img" src={waveformUrl(a)} alt="" draggable={false} />
                            ) : null}
                            <span
                              className="clip-handle left"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                const base = m.inPoint;
                                dragHandle(e.clientX, (d) =>
                                  patchMusicTrack(i, {
                                    inPoint: clamp(base + d, 0, m.outPoint - 0.5),
                                  }),
                                );
                              }}
                            />
                            <span className="clip-label">
                              ♪ {a?.name?.slice(0, 16) || `SFX ${i + 1}`}
                            </span>
                            <span
                              className="clip-handle right"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                const base = m.outPoint;
                                dragHandle(e.clientX, (d) =>
                                  patchMusicTrack(i, {
                                    outPoint: clamp(
                                      base + d,
                                      m.inPoint + 0.5,
                                      a?.duration || base + d,
                                    ),
                                  }),
                                );
                              }}
                            />
                          </div>
                        );
                      })}
                      {!music && !musicTracks.length && (
                        <span className="lane-empty">No music — add a track from the toolbar.</span>
                      )}
                    </div>
                    )}
      
                    {/* TEXT track */}
                    <TrackHeader
                      track={tracks.text}
                      onPatch={(p) => patchTrack("text", p)}
                      count={texts.length}
                    />
                    {!tracks.text.hidden && (
                    <div
                      className="track track-text"
                      style={{ height: tracks.text.collapsed ? 12 : tracks.text.height, opacity: 1 }}
                    >
                      {texts.map((t) => (
                        <div
                          key={t.id}
                          className={`text-block${selectedTextId === t.id ? " on" : ""}`}
                          style={{
                            left: t.start * pxPerSec,
                            width: Math.max(24, t.duration * pxPerSec),
                            borderColor: tracks.text.color,
                          }}
                          onPointerDown={(e) => {
                            if (tracks.text.locked) {
                              pushToast("Text track is locked", "info");
                              return;
                            }
                            setSelectedTextId(t.id);
                            setSelectedId(null);
                            setSelectedIds([]);
                            setTab("text");
                            const base = t.start;
                            dragHandle(e.clientX, (d) => patchText(t.id, { start: snapSec(base + d) }));
                          }}
                        >
                          <span
                            className="clip-handle left"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const baseStart = t.start;
                              const baseDur = t.duration;
                              dragHandle(e.clientX, (d) => {
                                const ns = Math.max(0, baseStart + d);
                                const nd = Math.max(0.5, baseDur - (ns - baseStart));
                                patchText(t.id, { start: ns, duration: nd });
                              });
                            }}
                          />
                          <span className="clip-label">T {t.text.slice(0, 16)}</span>
                          <span
                            className="clip-handle right"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const base = t.duration;
                              dragHandle(e.clientX, (d) => patchText(t.id, { duration: Math.max(0.5, base + d) }));
                            }}
                          />
                        </div>
                      ))}
                      {!texts.length && <span className="lane-empty">No text — press “Text” to add a title.</span>}
                    </div>
                    )}
      
                    <div className="playhead" style={{ left: current * pxPerSec }} />
                  </div>
                </div>
      
                <TimelineMinimap
                  clips={clips}
                  starts={starts}
                  total={total}
                  current={current}
                  selectedIds={selectedIds}
                  music={music}
                  mainColor={tracks.video.color}
                  overlayColor={tracks.overlay.color}
                  onJump={(time, frac) => {
                    seek(time);
                    const el = trackRef.current;
                    if (el) el.scrollLeft = Math.max(0, frac * timelineWidth - el.clientWidth / 2);
                  }}
                />
    </section>
  );
}

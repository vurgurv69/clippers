"use client";

import { forwardRef, useState, type MutableRefObject, type ReactNode, type Ref } from "react";
import type { MusicTrack, ProjectAsset, TextOverlay, TimelineClip } from "@/lib/editor-types";
import { TextLayer } from "@/components/editor/TextLayer";
import { WebGLFxPreview } from "@/components/editor/WebGLFxPreview";
import { AudioMeter } from "@/components/editor/AudioMeter";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as { current: T | null }).current = value;
}

export type PreviewGuides = { thirds: boolean; center: boolean; safe: boolean };

export type PreviewOverlayItem = {
  c: TimelineClip;
  start: number;
  asset: ProjectAsset | null;
};

type Props = {
  aspectW: number;
  aspectH: number;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  videoRef: Ref<HTMLVideoElement>;
  musicRef: Ref<HTMLAudioElement>;
  /** Extra SFX / music lanes for program monitor playback */
  sfxTracks?: { id: string; asset: ProjectAsset; track: MusicTrack }[];
  sfxRefs?: MutableRefObject<(HTMLAudioElement | null)[]>;
  activeClip: TimelineClip | null;
  activeAsset: ProjectAsset | null;
  activeLocalT: number;
  colorFilter: (c: TimelineClip | null, localT?: number) => string;
  previewTransform: (c: TimelineClip | null, localT?: number) => string | undefined;
  previewOpacity: (c: TimelineClip | null, localT?: number) => number;
  assetUrl: (a: ProjectAsset, opts?: { full?: boolean }) => string;
  overlayHidden: boolean;
  overlayMuted: boolean;
  visibleOverlays: PreviewOverlayItem[];
  current: number;
  visibleTexts: TextOverlay[];
  selectedTextId: string | null;
  guides: PreviewGuides;
  setGuides: (fn: (g: PreviewGuides) => PreviewGuides) => void;
  hasClips: boolean;
  /** True when the media library has at least one asset */
  hasMedia?: boolean;
  onImportMedia?: (files: FileList) => void;
  music: boolean;
  musicAsset: ProjectAsset | null;
  fmt: (t: number) => string;
  total: number;
  fps: number;
  rate: number;
  dir: 1 | -1;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  useProxy?: boolean;
  onTogglePlay: () => void;
  onStepFrame: (frames: number) => void;
  onPlayReverse: () => void;
  onPlayForward: () => void;
  onStop: () => void;
  onSetRate: (r: number) => void;
  onSetDir: (d: 1 | -1) => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleProxy?: () => void;
  /** Optional extra nodes inside the preview (unused reserved) */
  children?: ReactNode;
  /** GPU shader preview for heavy effects */
  glFx?: boolean;
  transitionBlend?: {
    kind: string;
    u: number;
    from: TimelineClip;
    to: TimelineClip;
    fromAsset: ProjectAsset | null;
    toAsset: ProjectAsset | null;
    fromLocal: number;
    toLocal: number;
  } | null;
};

export const StudioPreview = forwardRef<HTMLDivElement, Props>(function StudioPreview(
  {
    aspectW,
    aspectH,
    dragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    videoRef,
    musicRef,
    sfxTracks = [],
    sfxRefs,
    activeClip,
    activeAsset,
    activeLocalT,
    colorFilter,
    previewTransform,
    previewOpacity,
    assetUrl,
    overlayHidden,
    overlayMuted,
    visibleOverlays,
    current,
    visibleTexts,
    selectedTextId,
    guides,
    setGuides,
    hasClips,
    hasMedia = true,
    onImportMedia,
    music,
    musicAsset,
    fmt,
    total,
    fps,
    rate,
    dir,
    playing,
    loop,
    muted,
    useProxy = true,
    onTogglePlay,
    onStepFrame,
    onPlayReverse,
    onPlayForward,
    onStop,
    onSetRate,
    onSetDir,
    onToggleLoop,
    onToggleMute,
    onToggleFullscreen,
    onToggleProxy,
    glFx = true,
    transitionBlend = null,
  },
  ref,
) {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
    // Kept for parent API / future frame jog; transport uses Back/Play/Stop/Forward.
    void onStepFrame;
    void rate;
    void dir;
    void loop;
    void fps;
    void onSetRate;
    void onSetDir;
    void onToggleLoop;

  const wantsGl =
    glFx &&
    Boolean(
      activeClip &&
        activeAsset?.kind === "video" &&
        ((activeClip.effects || []).some((f) => f.enabled) ||
          (activeClip.color.vignette ?? 0) > 0.02 ||
          Math.abs(activeClip.color.hueShift ?? 0) > 0.5 ||
          Boolean(activeClip.color.lut)),
    );

  const mediaStyle = {
    filter: wantsGl ? "none" : colorFilter(activeClip, activeLocalT),
    transform: previewTransform(activeClip, activeLocalT),
    opacity: wantsGl
      ? 0
      : previewOpacity(activeClip, activeLocalT) *
        (transitionBlend &&
        (transitionBlend.kind === "crossfade" ||
          transitionBlend.kind === "dissolve" ||
          transitionBlend.kind === "fadeblack" ||
          transitionBlend.kind === "fadewhite")
          ? 1 - transitionBlend.u
          : 1),
  };

  const blendIncomingStyle = (() => {
    if (!transitionBlend?.toAsset) return null;
    const u = transitionBlend.u;
    const kind = transitionBlend.kind;
    const base = {
      filter: colorFilter(transitionBlend.to, transitionBlend.toLocal),
      transform: previewTransform(transitionBlend.to, transitionBlend.toLocal),
      opacity: previewOpacity(transitionBlend.to, transitionBlend.toLocal),
    };
    if (kind === "crossfade" || kind === "dissolve") {
      return { ...base, opacity: base.opacity * u };
    }
    if (kind === "fadeblack" || kind === "fadewhite") {
      return { ...base, opacity: base.opacity * Math.max(0, (u - 0.5) * 2) };
    }
    if (kind === "slide" || kind === "push" || kind === "whip") {
      return {
        ...base,
        opacity: base.opacity,
        transform: `${base.transform || ""} translateX(${(1 - u) * 100}%)`,
      };
    }
    if (kind === "zoom") {
      return {
        ...base,
        opacity: base.opacity * u,
        transform: `${base.transform || ""} scale(${0.85 + 0.15 * u})`,
      };
    }
    if (kind === "wipeup" || kind === "wipedown") {
      const wipe =
        kind === "wipeup"
          ? `inset(${(1 - u) * 100}% 0 0 0)`
          : `inset(0 0 ${(1 - u) * 100}% 0)`;
      return { ...base, opacity: base.opacity, clipPath: wipe };
    }
    if (kind === "circlewipe") {
      return {
        ...base,
        opacity: base.opacity,
        clipPath: `circle(${u * 75}% at 50% 50%)`,
      };
    }
    // default soft dissolve for everything else
    return { ...base, opacity: base.opacity * u };
  })();

  const mediaOverlays = visibleOverlays.filter((o) => !o.c.adjustment && o.asset);
  const adjOverlays = visibleOverlays.filter((o) => o.c.adjustment);

  return (
    <div className="studio-stage cc-stage" ref={ref}>
      <div className="cc-phone-wrap">
        <button
          type="button"
          className="cc-fs-corner"
          onClick={onToggleFullscreen}
          title="Fullscreen"
        >
          ⛶
        </button>
      <div
        className={`studio-preview cc-phone${aspectH > aspectW ? " portrait" : " landscape"}${dragOver ? " drag" : ""}`}
        style={{ aspectRatio: `${aspectW} / ${aspectH}` }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="preview-program">
          <video
            ref={(node) => {
              setVideoEl(node);
              assignRef(videoRef, node);
            }}
            playsInline
            preload="auto"
            src={
              activeAsset?.kind === "video" ? assetUrl(activeAsset) : undefined
            }
            style={{
              ...mediaStyle,
              display: activeAsset?.kind === "video" ? "block" : "none",
            }}
            onClick={onTogglePlay}
            onError={(e) => {
              // Proxy missing / bad URL — fall back to original filename once.
              const el = e.currentTarget;
              if (!activeAsset || activeAsset.kind !== "video") return;
              const full = assetUrl(activeAsset, { full: true });
              if (el.src && !el.src.includes(encodeURIComponent(activeAsset.filename))) {
                el.src = full;
                el.load();
              }
            }}
          />
          {wantsGl && (
            <WebGLFxPreview
              video={videoEl}
              clip={activeClip}
              enabled={wantsGl}
              lutUrl={
                activeClip?.color.lut
                  ? assetUrl({
                      id: "lut-preview",
                      kind: "lut",
                      name: activeClip.color.lut,
                      filename: activeClip.color.lut,
                      duration: 0,
                      hasAudio: false,
                    })
                  : null
              }
            />
          )}
          {activeAsset?.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="preview-image"
              src={assetUrl(activeAsset)}
              alt=""
              style={{
                filter: colorFilter(activeClip, activeLocalT),
                transform: previewTransform(activeClip, activeLocalT),
                opacity:
                  previewOpacity(activeClip, activeLocalT) *
                  (transitionBlend &&
                  (transitionBlend.kind === "crossfade" ||
                    transitionBlend.kind === "dissolve")
                    ? 1 - transitionBlend.u
                    : 1),
              }}
              onClick={onTogglePlay}
            />
          )}

          {blendIncomingStyle && transitionBlend?.toAsset && (
            transitionBlend.toAsset.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="preview-transition-in"
                src={assetUrl(transitionBlend.toAsset)}
                alt=""
                style={blendIncomingStyle}
                aria-hidden
              />
            ) : (
              <video
                className="preview-transition-in"
                src={`${assetUrl(transitionBlend.toAsset)}#t=${(
                  transitionBlend.to.inPoint +
                  transitionBlend.toLocal * (transitionBlend.to.speed || 1)
                ).toFixed(2)}`}
                muted
                playsInline
                style={blendIncomingStyle}
                aria-hidden
              />
            )
          )}

          {(transitionBlend?.kind === "fadeblack" ||
            transitionBlend?.kind === "fadewhite" ||
            transitionBlend?.kind === "flash") && (
            <div
              className="preview-transition-flash"
              style={{
                background:
                  transitionBlend.kind === "fadewhite" ||
                  transitionBlend.kind === "flash"
                    ? "#fff"
                    : "#000",
                opacity:
                  transitionBlend.kind === "flash"
                    ? Math.sin(transitionBlend.u * Math.PI)
                    : 1 - Math.abs(transitionBlend.u * 2 - 1),
              }}
              aria-hidden
            />
          )}

          {activeClip && activeClip.color.vignette > 0 && (
            <div
              className="preview-vignette"
              style={{ opacity: Math.min(1, activeClip.color.vignette) }}
            />
          )}

          {!overlayHidden &&
            mediaOverlays.map(({ c, start, asset }) => {
              if (overlayMuted || !asset) return null;
              const localT = current - start;
              const style = {
                filter: colorFilter(c, localT),
                transform: previewTransform(c, localT),
                opacity: previewOpacity(c, localT),
              };
              return asset.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={c.id}
                  className="preview-overlay"
                  src={assetUrl(asset)}
                  alt=""
                  style={style}
                />
              ) : (
                <video
                  key={c.id}
                  className="preview-overlay"
                  src={`${assetUrl(asset)}#t=${(c.inPoint + localT * (c.speed || 1)).toFixed(2)}`}
                  muted
                  playsInline
                  style={style}
                />
              );
            })}
        </div>

        {/* Adjustment layers: soft-light grade wash over the program stack */}
        {!overlayHidden &&
          adjOverlays.map(({ c, start }) => {
            const localT = current - start;
            return (
              <div
                key={c.id}
                className="preview-adj-layer"
                style={{
                  filter: colorFilter(c, localT),
                  opacity: Math.min(0.9, previewOpacity(c, localT)),
                  mixBlendMode: "soft-light",
                }}
                aria-hidden
              />
            );
          })}

        {visibleTexts.map((t) => (
          <TextLayer key={t.id} t={t} current={current} selected={t.id === selectedTextId} />
        ))}

        {guides.thirds && (
          <div className="guide guide-thirds" aria-hidden>
            <span className="gl v" style={{ left: "33.33%" }} />
            <span className="gl v" style={{ left: "66.66%" }} />
            <span className="gl h" style={{ top: "33.33%" }} />
            <span className="gl h" style={{ top: "66.66%" }} />
          </div>
        )}
        {guides.center && (
          <div className="guide guide-center" aria-hidden>
            <span className="gl v" style={{ left: "50%" }} />
            <span className="gl h" style={{ top: "50%" }} />
          </div>
        )}
        {guides.safe && <div className="guide guide-safe" aria-hidden />}

        {!hasClips && (
          <div className="preview-empty pro-empty">
            <div className="empty-illustration" aria-hidden>
              <span className="empty-film" />
            </div>
            <p className="empty-title">Your preview</p>
            <p className="empty-hint">
              {hasMedia
                ? "Click a clip in Media to add it to the timeline"
                : "Import media from the left panel to get started"}
            </p>
          </div>
        )}
      </div>
      </div>

      {music && musicAsset && (
        <audio ref={musicRef} src={assetUrl(musicAsset)} preload="auto" hidden />
      )}
      {sfxTracks.map((s, i) => (
        <audio
          key={s.id}
          ref={(node) => {
            if (sfxRefs) sfxRefs.current[i] = node;
          }}
          src={assetUrl(s.asset)}
          preload="auto"
          hidden
        />
      ))}

      <div className="studio-transport cc-transport">
        <div className="transport-center">
          <div className="transport-row">
            <button className="btn round sm" onClick={onPlayReverse} title="Back (J)">
              ‹‹
            </button>
            <button
              className="btn round play-main"
              onClick={onTogglePlay}
              title="Play / pause (Space)"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button className="btn round sm" onClick={onStop} title="Stop (K)">
              ■
            </button>
            <button className="btn round sm" onClick={onPlayForward} title="Forward (L)">
              ››
            </button>
          </div>
          <div className="transport-meta">
            <span className="studio-time">
              {fmt(current)} <em>/ {fmt(total)}</em>
            </span>
            <AudioMeter media={videoEl} />
          </div>
        </div>

        <div className="preview-toolbar cc-preview-mini" aria-label="Preview options">
          <button
            className={guides.thirds ? "btn tiny on" : "btn tiny"}
            onClick={() => setGuides((g) => ({ ...g, thirds: !g.thirds }))}
            title="Guides"
          >
            Guides
          </button>
          <button
            className={muted ? "btn tiny on" : "btn tiny"}
            onClick={onToggleMute}
            title="Mute (M)"
          >
            {muted ? "Mute" : "Sound"}
          </button>
          {onToggleProxy && (
            <button
              className={useProxy ? "btn tiny on" : "btn tiny"}
              onClick={onToggleProxy}
              title="Preview quality"
            >
              {useProxy ? "Proxy" : "Full"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

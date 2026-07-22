"use client";

import { forwardRef, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type Ref } from "react";
import type { MusicTrack, ProjectAsset, TextOverlay, TimelineClip } from "@/lib/editor-types";
import { TextLayer } from "@/components/editor/TextLayer";
import { WebGLFxPreview } from "@/components/editor/WebGLFxPreview";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as { current: T | null }).current = value;
}

/**
 * Incoming clip during a transition — keeps decoding/playing with the playhead
 * instead of freezing on a #t= poster frame.
 */
function TransitionIncomingVideo({
  src,
  sourceTime,
  playing,
  speed = 1,
  style,
  className,
}: {
  src: string;
  sourceTime: number;
  playing: boolean;
  speed?: number;
  style: CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastSeek = useRef(0);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.dataset.src !== src) {
      v.dataset.src = src;
      v.src = src;
      v.load();
    }
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const target = Math.max(0, sourceTime);
    const rate = Math.max(0.25, Math.min(4, speed || 1));
    const apply = () => {
      v.playbackRate = rate;
      const drift = Math.abs(v.currentTime - target);
      // While playing, only correct big drift so both clips keep motion.
      const needSeek = playing ? drift > 0.28 : drift > 0.04;
      if (needSeek && performance.now() - lastSeek.current > 40) {
        lastSeek.current = performance.now();
        try {
          v.currentTime = target;
        } catch {
          /* ignore */
        }
      }
      if (playing) {
        if (v.paused) void v.play().catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    };
    if (v.readyState >= 2) apply();
    else {
      const onReady = () => {
        apply();
        v.removeEventListener("loadeddata", onReady);
      };
      v.addEventListener("loadeddata", onReady);
      return () => v.removeEventListener("loadeddata", onReady);
    }
  }, [sourceTime, playing, speed]);

  return (
    <video
      ref={ref}
      className={className}
      muted
      playsInline
      preload="auto"
      style={style}
      aria-hidden
    />
  );
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
  /** Resolve clip-layer media for stacked preview. */
  assetById?: Map<string, ProjectAsset>;
  overlayHidden: boolean;
  overlayMuted: boolean;
  visibleOverlays: PreviewOverlayItem[];
  current: number;
  visibleTexts: TextOverlay[];
  selectedTextId: string | null;
  projectId?: string;
  onSelectText?: (id: string) => void;
  onPatchText?: (id: string, patch: Partial<TextOverlay>) => void;
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
    assetById,
    overlayHidden,
    overlayMuted,
    visibleOverlays,
    current,
    visibleTexts,
    selectedTextId,
    projectId,
    onSelectText,
    onPatchText,
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
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const triedFullRef = useRef(false);
    // Kept for parent API / future frame jog; transport uses Back/Play/Stop/Forward.
    void onStepFrame;
    void rate;
    void dir;
    void loop;
    void fps;
    void onSetRate;
    void onSetDir;
    void onToggleLoop;

  useEffect(() => {
    setMediaError(null);
    triedFullRef.current = false;
  }, [activeAsset?.id]);

  // Loading / seeking spinner so scrubbing never feels "stuck"
  useEffect(() => {
    const v = videoEl;
    if (!v || activeAsset?.kind !== "video") {
      setMediaBusy(false);
      return;
    }
    const onBusy = () => setMediaBusy(true);
    const onReady = () => {
      setMediaBusy(false);
      setMediaError(null);
    };
    v.addEventListener("loadstart", onBusy);
    v.addEventListener("waiting", onBusy);
    v.addEventListener("seeking", onBusy);
    v.addEventListener("canplay", onReady);
    v.addEventListener("playing", onReady);
    v.addEventListener("seeked", onReady);
    if (v.readyState >= 3) setMediaBusy(false);
    return () => {
      v.removeEventListener("loadstart", onBusy);
      v.removeEventListener("waiting", onBusy);
      v.removeEventListener("seeking", onBusy);
      v.removeEventListener("canplay", onReady);
      v.removeEventListener("playing", onReady);
      v.removeEventListener("seeked", onReady);
    };
  }, [videoEl, activeAsset?.id, activeAsset?.kind]);

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

  const mediaStyle = (() => {
    const baseT = previewTransform(activeClip, activeLocalT);
    const baseO = previewOpacity(activeClip, activeLocalT);
    if (!transitionBlend) {
      return {
        filter: wantsGl ? "none" : colorFilter(activeClip, activeLocalT),
        transform: baseT,
        opacity: wantsGl ? 0 : baseO,
      };
    }
    const u = transitionBlend.u;
    const kind = transitionBlend.kind;
    let transform = baseT || "";
    let opacity = baseO;
    // Motion transitions: keep both clips live and moving with the playhead.
    if (kind === "slide" || kind === "push" || kind === "whip") {
      transform = `${transform} translateX(${-u * 100}%)`.trim();
    } else if (kind === "slideright" || kind === "pull") {
      transform = `${transform} translateX(${u * 100}%)`.trim();
    } else if (kind === "slideup") {
      transform = `${transform} translateY(${-u * 100}%)`.trim();
    } else if (kind === "slidedown") {
      transform = `${transform} translateY(${u * 100}%)`.trim();
    } else if (kind === "zoom" || kind === "zoomout") {
      const s = kind === "zoom" ? 1 + u * 0.35 : 1 - u * 0.25;
      transform = `${transform} scale(${s})`.trim();
      opacity = baseO * (1 - u * 0.55);
    } else if (kind === "flash") {
      opacity = baseO * (1 - Math.sin(u * Math.PI) * 0.35);
    } else if (
      kind === "wipeleft" ||
      kind === "wiperight" ||
      kind === "wipeup" ||
      kind === "wipedown" ||
      kind === "iris" ||
      kind === "circlewipe" ||
      kind === "clockwipe"
    ) {
      opacity = baseO; // wipe reveals incoming on top
    } else {
      opacity = baseO * (1 - u * 0.92);
    }
    return {
      filter: wantsGl ? "none" : colorFilter(activeClip, activeLocalT),
      transform,
      opacity: wantsGl ? 0 : opacity,
    };
  })();

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
    if (kind === "slideright" || kind === "pull") {
      return {
        ...base,
        opacity: base.opacity,
        transform: `${base.transform || ""} translateX(${(u - 1) * 100}%)`,
      };
    }
    if (kind === "slideup") {
      return {
        ...base,
        opacity: base.opacity,
        transform: `${base.transform || ""} translateY(${(1 - u) * 100}%)`,
      };
    }
    if (kind === "slidedown") {
      return {
        ...base,
        opacity: base.opacity,
        transform: `${base.transform || ""} translateY(${(u - 1) * 100}%)`,
      };
    }
    if (kind === "zoom" || kind === "morph") {
      return {
        ...base,
        opacity: base.opacity * Math.min(1, u * 1.15),
        transform: `${base.transform || ""} scale(${0.82 + 0.18 * u})`,
      };
    }
    if (kind === "zoomout") {
      return {
        ...base,
        opacity: base.opacity * Math.min(1, u * 1.2),
        transform: `${base.transform || ""} scale(${1.25 - 0.25 * u})`,
      };
    }
    if (kind === "wipeup" || kind === "wipedown" || kind === "wipeleft" || kind === "wiperight") {
      const wipe =
        kind === "wipeup"
          ? `inset(${(1 - u) * 100}% 0 0 0)`
          : kind === "wipedown"
            ? `inset(0 0 ${(1 - u) * 100}% 0)`
            : kind === "wipeleft"
              ? `inset(0 0 0 ${(1 - u) * 100}%)`
              : `inset(0 ${(1 - u) * 100}% 0 0)`;
      return { ...base, opacity: base.opacity, clipPath: wipe };
    }
    if (kind === "circlewipe" || kind === "clockwipe" || kind === "iris") {
      return {
        ...base,
        opacity: base.opacity,
        clipPath: `circle(${u * 78}% at 50% 50%)`,
      };
    }
    if (kind === "spin" || kind === "cube" || kind === "flip") {
      return {
        ...base,
        opacity: base.opacity * Math.min(1, u * 1.2),
        transform: `${base.transform || ""} rotate(${(1 - u) * (kind === "flip" ? 90 : 18)}deg) scale(${0.9 + 0.1 * u})`,
      };
    }
    if (kind === "blur" || kind === "liquid" || kind === "warp") {
      return {
        ...base,
        opacity: base.opacity * u,
        filter: `${base.filter === "none" ? "" : base.filter + " "}blur(${(1 - u) * 10}px)`.trim(),
      };
    }
    if (kind === "glitch" || kind === "shake") {
      const jx = (1 - u) * (Math.sin(u * 40) * 12);
      return {
        ...base,
        opacity: base.opacity * Math.min(1, 0.4 + u),
        transform: `${base.transform || ""} translate(${jx}px, 0)`,
      };
    }
    if (kind === "flash" || kind === "filmburn") {
      return { ...base, opacity: base.opacity * Math.max(0, (u - 0.35) * 1.6) };
    }
    // Soft dissolve for everything else (still visible)
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
              const alreadyFull =
                triedFullRef.current ||
                (el.src && el.src.includes(encodeURIComponent(activeAsset.filename)));
              if (!alreadyFull) {
                triedFullRef.current = true;
                el.src = full;
                el.load();
                return;
              }
              setMediaBusy(false);
              setMediaError("Couldn't load this clip");
            }}
          />
          {mediaBusy && !mediaError && activeAsset?.kind === "video" && (
            <div className="preview-loading" aria-live="polite" aria-busy="true">
              <span className="preview-loading-spinner" aria-hidden />
              <span className="preview-loading-label">Loading</span>
            </div>
          )}
          {mediaError && (
            <div className="preview-error" role="alert">
              <p className="preview-error-title">{mediaError}</p>
              <p className="preview-error-hint">
                File may be missing, corrupt, or still uploading.
              </p>
              <button
                type="button"
                className="btn tiny preview-error-retry"
                onClick={() => {
                  const v = videoEl;
                  if (!v || !activeAsset || activeAsset.kind !== "video") return;
                  setMediaError(null);
                  triedFullRef.current = false;
                  setMediaBusy(true);
                  v.src = assetUrl(activeAsset);
                  v.load();
                }}
              >
                Retry
              </button>
            </div>
          )}
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
              <TransitionIncomingVideo
                className="preview-transition-in"
                src={assetUrl(transitionBlend.toAsset)}
                sourceTime={
                  transitionBlend.to.inPoint +
                  transitionBlend.toLocal * (transitionBlend.to.speed || 1)
                }
                playing={playing}
                speed={transitionBlend.to.speed || 1}
                style={blendIncomingStyle}
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

          {activeClip &&
            assetById &&
            (activeClip.layers || [])
              .filter((l) => l.enabled !== false && l.assetId)
              .map((layer) => {
                const asset = assetById.get(layer.assetId!);
                if (!asset || (asset.kind !== "image" && asset.kind !== "video")) return null;
                const opacity = layer.opacity ?? 1;
                return asset.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={layer.id}
                    className="preview-overlay clip-layer-overlay"
                    src={assetUrl(asset)}
                    alt=""
                    style={{ opacity }}
                  />
                ) : (
                  <video
                    key={layer.id}
                    className="preview-overlay clip-layer-overlay"
                    src={`${assetUrl(asset)}#t=${activeLocalT.toFixed(2)}`}
                    muted
                    playsInline
                    style={{ opacity }}
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
          <TextLayer
            key={t.id}
            t={t}
            current={current}
            selected={t.id === selectedTextId}
            projectId={projectId}
            onSelect={onSelectText}
            onPatch={onPatchText}
          />
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
            <p className="empty-title">Nothing on the timeline</p>
            <p className="empty-hint">
              {hasMedia
                ? "Drop a clip from Media onto the timeline — preview appears here"
                : "Import video or photos in the Media panel to start editing"}
            </p>
            {onImportMedia && !hasMedia && (
              <label className="btn primary empty-import">
                Import media
                <input
                  type="file"
                  accept="video/*,image/*,audio/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length) onImportMedia(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
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
    </div>
  );
});

"use client";

import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";
import { BezierEditor } from "@/components/editor/BezierEditor";
import { ColorWheelsRow, HueColorWheel } from "@/components/editor/ColorWheels";
import { TransitionChip } from "@/components/editor/TransitionWidgets";
import { TextPanel } from "@/components/editor/inspector/TextPanel";
import {
  EffectPreview,
  TransitionPreview,
} from "@/components/editor/library/FxPreviewBox";
import { TRANSITION_UI_IDS } from "@/lib/capcut-catalog";
import {
  COLOR_PRESETS,
  DEFAULT_TRANSFORM,
  EFFECT_DEFS,
  KEYFRAME_EASES,
  TRANSITION_DEFS,
  clipLane,
  clipLength,
  type BezierHandles,
  type ClipLayer,
  type EffectKind,
  type KeyframeEase,
  type KeyframeProp,
  type MusicTrack,
  type ProjectAsset,
  type TextOverlay,
  type TimelineClip,
  type TimelineMarker,
  type ClipTransform,
  type TransitionKind,
} from "@/lib/editor-types";
import { InspSection, PanelBlock, inspMatch } from "@/components/editor/InspSection";
import { AudioMixerStrip } from "@/components/editor/AudioMixerStrip";
import { KeyframeGraph } from "@/components/editor/KeyframeGraph";

const TRANSITION_UI = new Set<string>(TRANSITION_UI_IDS);
const TRANSITIONS = TRANSITION_DEFS.filter(
  (t) => t.id === "none" || TRANSITION_UI.has(t.id),
);

function YoutubeAudioImport({
  busy,
  onImport,
}: {
  busy: boolean;
  onImport: (url: string) => void | Promise<void>;
}) {
  const [url, setUrl] = useState("");
  return (
    <div className="yt-audio-import">
      <input
        className="clip-layers-search"
        placeholder="Paste YouTube link…"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && url.trim()) void onImport(url.trim());
        }}
        aria-label="YouTube URL"
      />
      <button
        type="button"
        className="btn tiny"
        disabled={busy || !url.trim()}
        onClick={() => void onImport(url.trim())}
      >
        {busy ? "…" : "Get audio"}
      </button>
    </div>
  );
}

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
  setUploadingMusic: Dispatch<SetStateAction<boolean>>;
  fxSearch: string;
  setFxSearch: Dispatch<SetStateAction<string>>;
  inspSearch?: string;
  trSearch: string;
  setTrSearch: Dispatch<SetStateAction<string>>;
  favTr: TransitionKind[];
  previewTransition: TransitionKind;
  setPreviewTransition: Dispatch<SetStateAction<TransitionKind>>;
  demoKey: number;
  setDemoKey: Dispatch<SetStateAction<number>>;
  defaultEase: KeyframeEase;
  defaultBezier: BezierHandles;
  setDefaultBezier: Dispatch<SetStateAction<BezierHandles>>;
  patchClip: (id: string, patch: Partial<TimelineClip>) => void;
  /** Phase 31 — split clip into graduated-speed pieces. */
  applySpeedRamp?: (clipId: string, kind: import("@/lib/speed-ramp").SpeedRampKind) => void;
  patchColor: (id: string, patch: Partial<TimelineClip["color"]>) => void;
  patchTransform: (id: string, patch: Partial<ClipTransform>) => void;
  patchMusic: (patch: Partial<MusicTrack>) => void;
  patchText: (id: string, patch: Partial<TextOverlay>) => void;
  setMusic: Dispatch<SetStateAction<MusicTrack | null>>;
  setMusicTracks: Dispatch<SetStateAction<MusicTrack[]>>;
  mixerSolo: string | null;
  setMixerSolo: Dispatch<SetStateAction<string | null>>;
  setAssets: Dispatch<SetStateAction<ProjectAsset[]>>;
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
  /** Extract audio from a video file into the music lane. */
  onExtractAudioFromVideo?: (f: File) => void | Promise<void>;
  /** Download audio from a YouTube URL into the music lane. */
  onImportYoutubeAudio?: (url: string) => void | Promise<void>;
  addText: () => void;
  addSticker: (glyph: string) => void;
  addPackSticker?: (src: string, label: string) => void;
  deleteText: (id: string) => void;
  applyTransition: () => void;
  toggleFav: (id: TransitionKind) => void;
  moveClip: (id: string, dir: -1 | 1) => void;
  duplicateClip: (id: string) => void;
  moveClipToLane: (id: string, lane: number) => void;
  deleteClip: (id: string) => void;
  pushToast: (msg: string, kind?: "info" | "success" | "error") => void;
  gradeClipboardRef: MutableRefObject<TimelineClip["color"] | null>;
  markers?: TimelineMarker[];
  addMarker?: () => void;
  patchMarker?: (id: string, patch: Partial<TimelineMarker>) => void;
  removeMarker?: (id: string) => void;
  addAdjustmentLayer?: () => void;
  addClipLayer?: (clipId: string, assetId: string, name?: string) => string | undefined;
  uploadClipLayerFile?: (clipId: string, file: File, name?: string) => Promise<string | undefined>;
  renameClipLayer?: (clipId: string, layerId: string, name: string) => void;
  removeClipLayer?: (clipId: string, layerId: string) => void;
  patchClipLayer?: (clipId: string, layerId: string, patch: Partial<ClipLayer>) => void;
  thumbUrl?: (a: ProjectAsset, t: number, w?: number) => string;
  assetUrl?: (a: ProjectAsset, opts?: { full?: boolean }) => string;
  useProxy?: boolean;
  onToggleProxy?: () => void;
  snapEnabled?: boolean;
  setSnapEnabled?: Dispatch<SetStateAction<boolean>>;
  magnetic?: boolean;
  setMagnetic?: Dispatch<SetStateAction<boolean>>;
  rippleEnabled?: boolean;
  setRippleEnabled?: Dispatch<SetStateAction<boolean>>;
  freeV1?: boolean;
  onToggleFreeV1?: () => void;
  setMulticamActive?: (clipId: string) => void;
  cutMulticamAtPlayhead?: (clipId: string) => void;
  syncMulticamGroup?: () => void | Promise<void>;
  clips?: TimelineClip[];
};

/** Identity helper so panels can destructure without repeating the type. */
function panelCtx(ctx: InspectorPanelCtx): InspectorPanelCtx {
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
  } = panelCtx(ctx);
  if (!selectedClip) {
    return (
      <div className="tool">
        <p className="tool-hint">Select a clip on the timeline.</p>
        {ctx.addAdjustmentLayer && (
          <button className="btn tiny wide" onClick={ctx.addAdjustmentLayer}>
            ▨ Add adjustment layer (V2)
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="tool">
      {selectedClip.multicamId && ctx.clips && (ctx.setMulticamActive || ctx.cutMulticamAtPlayhead) && (
        <InspSection
          id="mc-angles"
          title="Multicam angles"
          filterMatch={inspMatch(ctx.inspSearch || "", "multicam", "angles", "sync")}
        >
          <div className="chip-row">
            {ctx.clips
              .filter((c) => c.multicamId === selectedClip.multicamId)
              .map((c, i) => (
                <button
                  key={c.id}
                  className={c.multicamActive ? "chip on" : "chip"}
                  onClick={() =>
                    (ctx.cutMulticamAtPlayhead || ctx.setMulticamActive)?.(c.id)
                  }
                  title={c.multicamActive ? "Live angle" : "Cut to this angle at playhead"}
                >
                  <span>
                    {c.multicamActive ? "●" : "○"} Cam {i + 1}
                    {typeof c.multicamSync === "number" ? ` · ${c.multicamSync.toFixed(2)}s` : ""}
                  </span>
                </button>
              ))}
          </div>
          {ctx.syncMulticamGroup && (
            <button className="btn tiny wide" onClick={() => ctx.syncMulticamGroup?.()}>
              Sync angles to this master
            </button>
          )}
          <p className="tool-hint">Click an angle to cut at the playhead. Only the live angle exports.</p>
        </InspSection>
      )}
      <PanelBlock
        title={`Clip speed · ${(selectedClip.speed || 1).toFixed(2)}×`}
        hint="How fast this clip plays in the final cut (not the preview Speed menu)."
        filterMatch={inspMatch(ctx.inspSearch || "", "speed", "playback", "ramp")}
      >
      <Slider
        label="Playback speed"
        hint="0.5× = slow motion, 2× = double speed."
        min={0.25}
        max={4}
        value={selectedClip.speed || 1}
        onChange={(v) => patchClip(selectedClip.id, { speed: v })}
      />
      <div className="seg-row compact">
        {[0.5, 1, 1.5, 2].map((s) => (
          <button
            key={s}
            type="button"
            className={Math.abs((selectedClip.speed || 1) - s) < 0.01 ? "seg-btn on" : "seg-btn"}
            onClick={() => patchClip(selectedClip.id, { speed: s })}
          >
            {s}×
          </button>
        ))}
      </div>
      {ctx.applySpeedRamp && (
        <>
          <p className="tool-label" style={{ marginTop: "0.45rem" }}>
            Speed ramps
          </p>
          <div className="seg-row compact wrap">
            {(
              [
                ["ramp-in", "In"],
                ["ramp-out", "Out"],
                ["ramp-up", "Up"],
                ["ramp-down", "Down"],
                ["slow-mo", "Slow"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className="seg-btn"
                title={kind}
                onClick={() => ctx.applySpeedRamp?.(selectedClip.id, kind)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      </PanelBlock>

      <PanelBlock
        title="Look"
        hint="Everyday picture fixes. Presets apply a full look; sliders fine-tune."
        filterMatch={inspMatch(ctx.inspSearch || "", "color", "brightness", "contrast", "saturation", "vignette", "sharpen", "look", "preset")}
      >
      <p className="tool-label">Presets</p>
      <div className="preset-grid compact">
        {COLOR_PRESETS.map((p) => (
          <button
            key={p.id}
            className={selectedClip.color.preset === p.id ? "preset on" : "preset"}
            onClick={() => patchColor(selectedClip.id, { ...p.grade, preset: p.id })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Slider
        label="Brightness"
        hint="Overall light level."
        min={0}
        max={2}
        value={selectedClip.color.brightness}
        onChange={(v) => patchColor(selectedClip.id, { brightness: v, preset: "custom" })}
      />
      <Slider
        label="Contrast"
        hint="Separation between dark and bright areas."
        min={0}
        max={2}
        value={selectedClip.color.contrast}
        onChange={(v) => patchColor(selectedClip.id, { contrast: v, preset: "custom" })}
      />
      <Slider
        label="Saturation"
        hint="Color intensity. Lower = closer to gray."
        min={0}
        max={3}
        value={selectedClip.color.saturation}
        onChange={(v) => patchColor(selectedClip.id, { saturation: v, preset: "custom" })}
      />
      <Slider
        label="Sharpen"
        hint="Edge crispness."
        min={0}
        max={2}
        value={selectedClip.color.sharpen}
        onChange={(v) => patchColor(selectedClip.id, { sharpen: v, preset: "custom" })}
      />
      <Slider
        label="Vignette"
        hint="Darkens the corners."
        min={0}
        max={1}
        value={selectedClip.color.vignette}
        onChange={(v) => patchColor(selectedClip.id, { vignette: v, preset: "custom" })}
      />
      </PanelBlock>

      <InspSection
        id="hsl"
        title="HSL"
        filterMatch={inspMatch(ctx.inspSearch || "", "hsl", "hue", "lightness")}
      >
      <Slider
        label="Hue"
        min={-180}
        max={180}
        value={selectedClip.color.hueShift ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { hueShift: v, preset: "custom" })}
      />
      <Slider
        label="Lightness"
        min={-100}
        max={100}
        value={selectedClip.color.lightness ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { lightness: v, preset: "custom" })}
      />
      <p className="tool-hint">Saturation is above · hue/lightness bake on export.</p>
      </InspSection>

      <PanelBlock
        title="Lift / Gamma / Gain"
        hint="Drag anywhere on a wheel — up/down and left/right. Double-click to reset."
        filterMatch={inspMatch(ctx.inspSearch || "", "lift", "gamma", "gain", "wheels")}
      >
        <ColorWheelsRow
          lift={selectedClip.color.lift ?? 0}
          gamma={selectedClip.color.gamma ?? 0}
          gain={selectedClip.color.gain ?? 0}
          onChange={(p) => patchColor(selectedClip.id, { ...p, preset: "custom" })}
        />
      </PanelBlock>

      <PanelBlock
        title="Color wheel"
        hint="Pick a tint. Recent colors are saved on this device."
        filterMatch={inspMatch(ctx.inspSearch || "", "wheel", "hex", "recent", "tint", "hue")}
      >
        <HueColorWheel
          onPick={(hex) => {
            const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!m) return;
            const r = parseInt(m[1], 16) / 255;
            const g = parseInt(m[2], 16) / 255;
            const b = parseInt(m[3], 16) / 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            let hue = 0;
            if (d > 1e-6) {
              if (max === r) hue = ((g - b) / d) % 6;
              else if (max === g) hue = (b - r) / d + 2;
              else hue = (r - g) / d + 4;
              hue *= 60;
              if (hue < 0) hue += 360;
            }
            const sat = max < 1e-6 ? 0 : d / max;
            patchColor(selectedClip.id, {
              hueShift: Math.round(hue > 180 ? hue - 360 : hue),
              saturation: Math.min(3, 1 + sat * 0.85),
              preset: "custom",
            });
          }}
        />
      </PanelBlock>

      <p className="tool-label">Color grading</p>
      <Slider
        label="Temperature"
        min={-100}
        max={100}
        value={selectedClip.color.temperature ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { temperature: v, preset: "custom" })}
      />
      <Slider
        label="Tint"
        min={-100}
        max={100}
        value={selectedClip.color.tint ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { tint: v, preset: "custom" })}
      />
      <Slider
        label="Exposure"
        min={-100}
        max={100}
        value={selectedClip.color.exposure ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { exposure: v, preset: "custom" })}
      />
      <Slider
        label="Highlights"
        min={-100}
        max={100}
        value={selectedClip.color.highlights ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { highlights: v, preset: "custom" })}
      />
      <Slider
        label="Shadows"
        min={-100}
        max={100}
        value={selectedClip.color.shadows ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { shadows: v, preset: "custom" })}
      />
      <Slider
        label="Whites"
        min={-100}
        max={100}
        value={selectedClip.color.whites ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { whites: v, preset: "custom" })}
      />
      <Slider
        label="Blacks"
        min={-100}
        max={100}
        value={selectedClip.color.blacks ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { blacks: v, preset: "custom" })}
      />
      <p className="tool-label">Curves & LUT</p>
      <Slider
        label="Master curve"
        min={-100}
        max={100}
        value={selectedClip.color.curve ?? 0}
        onChange={(v) => patchColor(selectedClip.id, { curve: v, preset: "custom" })}
      />
      <p className="tool-hint">
        {selectedClip.color.lut
          ? `LUT: ${selectedClip.color.lut}`
          : "No LUT — upload .cube or pick from media"}
      </p>
      <div className="chip-row">
        <label className="chip">
          <span>Upload LUT</span>
          <input
            type="file"
            accept=".cube"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const form = new FormData();
              form.append("file", f);
              const res = await fetch(`/api/editor/project/${projectId}/asset`, {
                method: "POST",
                body: form,
              });
              const data = await res.json();
              if (!res.ok) {
                pushToast(data.error || "LUT upload failed", "error");
                return;
              }
              const asset = data.asset as ProjectAsset;
              setAssets((prev) => [...prev, asset]);
              patchColor(selectedClip.id, { lut: asset.filename, preset: "custom" });
              pushToast("LUT applied", "success");
              e.target.value = "";
            }}
          />
        </label>
        {selectedClip.color.lut && (
          <button
            className="chip"
            onClick={() => patchColor(selectedClip.id, { lut: undefined, preset: "custom" })}
          >
            <span>Clear LUT</span>
          </button>
        )}
        <button
          className="chip"
          onClick={() => addKeyframe(selectedClip.id, "brightness")}
          title="Brightness keyframe at playhead"
        >
          <span>◆ Brightness KF</span>
        </button>
      </div>
      <div className="chip-row">
        <button
          className="chip"
          onClick={() => {
            gradeClipboardRef.current = { ...selectedClip.color };
            pushToast("Grading copied", "success");
          }}
        >
          <span>Copy grade</span>
        </button>
        <button
          className="chip"
          onClick={() => {
            if (!gradeClipboardRef.current) {
              pushToast("No grading on clipboard", "info");
              return;
            }
            const targets =
              selectedIds.length > 1 ? selectedIds : [selectedClip.id];
            for (const tid of targets) {
              patchColor(tid, { ...gradeClipboardRef.current, preset: "custom" });
            }
            pushToast(`Grade pasted to ${targets.length} clip(s)`, "success");
          }}
        >
          <span>Paste grade</span>
        </button>
      </div>
      <button
        className="btn tiny wide"
        onClick={() =>
          patchColor(selectedClip.id, {
            temperature: 0,
            tint: 0,
            exposure: 0,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
            curve: 0,
            hueShift: 0,
            lightness: 0,
            lut: undefined,
            preset: "custom",
          })
        }
      >
        Reset grading
      </button>
    </div>
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
  } = panelCtx(ctx);
  if (!selectedClip) {
    return <p className="tool-hint">Select a clip to move, scale, or fade it.</p>;
  }
  return (
    <div className="tool">
      {(() => {
        const t = { ...DEFAULT_TRANSFORM, ...(selectedClip.transform || {}) };
        const q = ctx.inspSearch || "";
        return (
          <>
            <PanelBlock
              title="Transform"
              hint="Move, size, spin, and fade the selected clip. Zero position is center."
              filterMatch={inspMatch(q, "transform", "position", "scale", "move", "spin", "fade", "size")}
            >
              <Slider
                label="Move left · right"
                hint="Negative = left, positive = right."
                min={-1}
                max={1}
                value={t.x}
                onChange={(v) => patchTransform(selectedClip.id, { x: v })}
              />
              <Slider
                label="Move up · down"
                hint="Negative = up, positive = down."
                min={-1}
                max={1}
                value={t.y}
                onChange={(v) => patchTransform(selectedClip.id, { y: v })}
              />
              <Slider
                label="Size"
                hint="Scale both sides together."
                min={0.1}
                max={3}
                value={(t.scaleX + t.scaleY) / 2}
                onChange={(v) => patchTransform(selectedClip.id, { scaleX: v, scaleY: v })}
              />
              <Slider
                label="Spin"
                hint="Degrees."
                min={-180}
                max={180}
                value={t.rotation}
                onChange={(v) => patchTransform(selectedClip.id, { rotation: v })}
              />
              <Slider
                label="Fade"
                hint="1 = solid, 0 = invisible."
                min={0}
                max={1}
                value={t.opacity}
                onChange={(v) => patchTransform(selectedClip.id, { opacity: v })}
              />
              <button
                type="button"
                className="btn tiny wide"
                onClick={() =>
                  patchClip(selectedClip.id, { transform: { ...DEFAULT_TRANSFORM } })
                }
              >
                Reset
              </button>
            </PanelBlock>

            <InspSection
              id="xform-kf"
              title="Motion over time"
              hint="Keyframes animate values between playhead points."
              filterMatch={inspMatch(q, "keyframe", "animation", "ease", "bezier", "graph", "motion")}
              defaultOpen={false}
            >
              <p className="tool-label">Add at playhead</p>
              <div className="seg-row compact wrap">
                {(
                  [
                    ["opacity", "Fade"],
                    ["x", "X"],
                    ["y", "Y"],
                    ["scaleX", "W"],
                    ["scaleY", "H"],
                    ["rotation", "Spin"],
                  ] as [KeyframeProp, string][]
                ).map(([prop, label]) => (
                  <button
                    key={prop}
                    type="button"
                    className="seg-btn"
                    onClick={() => addKeyframe(selectedClip.id, prop)}
                    title={`Add ${label} keyframe`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="seg-row compact">
                <button
                  type="button"
                  className="seg-btn"
                  onClick={() => removeNearbyKeyframe(selectedClip.id)}
                >
                  Clear near
                </button>
                <button
                  type="button"
                  className="seg-btn"
                  onClick={() => copyKeyframes(selectedClip.id)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="seg-btn"
                  onClick={() => pasteKeyframes(selectedClip.id)}
                >
                  Paste
                </button>
              </div>
              <KeyframeGraph
                keyframes={selectedClip.keyframes || []}
                duration={clipLength(selectedClip)}
              />
              <p className="tool-label">Easing</p>
              <div className="seg-row compact wrap">
                {KEYFRAME_EASES.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={defaultEase === e.id ? "seg-btn on" : "seg-btn"}
                    onClick={() => setAllKeyframeEase(selectedClip.id, e.id)}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              {defaultEase === "bezier" && (
                <BezierEditor
                  value={defaultBezier}
                  onChange={(next) => {
                    setDefaultBezier(next);
                    setAllKeyframeEase(selectedClip.id, "bezier", next, true);
                  }}
                />
              )}
              <p className="tool-hint">
                {(selectedClip.keyframes || []).length} keyframe
                {(selectedClip.keyframes || []).length === 1 ? "" : "s"} · {defaultEase}
              </p>
            </InspSection>
          </>
        );
      })()}
    </div>
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
  } = panelCtx(ctx);
  if (!selectedClip) {
    return <p className="tool-hint">Select a clip on the timeline.</p>;
  }
  return (
    <div className="tool">
      <InspSection
        id="fx-lib"
        title="Effects library"
        filterMatch={inspMatch(ctx.inspSearch || "", "effect", "blur", "glow", "fx")}
      >
      <input
        className="fx-search"
        placeholder="Search effects…"
        value={fxSearch}
        onChange={(e) => setFxSearch(e.target.value)}
      />
      <div className="cc-grid cc-grid-3">
        {EFFECT_DEFS.filter(
          (d) =>
            !fxSearch.trim() ||
            d.label.toLowerCase().includes(fxSearch.toLowerCase()) ||
            d.hint.toLowerCase().includes(fxSearch.toLowerCase()),
        ).map((d) => (
          <button
            key={d.kind}
            type="button"
            className="cc-card fx-photo-card"
            onClick={() => addEffect(selectedClip.id, d.kind)}
            title={d.hint}
          >
            <span className="cc-card-thumb">
              <EffectPreview kind={d.kind} />
            </span>
            <span className="cc-card-label">{d.label}</span>
          </button>
        ))}
      </div>
      </InspSection>

      <InspSection
        id="fx-stack"
        title={`Applied · ${(selectedClip.effects || []).length}`}
        filterMatch={inspMatch(ctx.inspSearch || "", "applied", "stack", "effect")}
      >
      {(selectedClip.effects || []).length === 0 ? (
        <p className="tool-hint">No effects yet. Add one above.</p>
      ) : (
        <div className="fx-stack">
          {(selectedClip.effects || []).map((fx, i, arr) => {
            const def = EFFECT_DEFS.find((d) => d.kind === fx.kind);
            return (
              <div
                key={fx.id}
                className={fx.enabled ? "fx-item" : "fx-item off"}
              >
                <div className="fx-item-head">
                  <button
                    className={fx.enabled ? "fx-toggle on" : "fx-toggle"}
                    onClick={() =>
                      updateEffect(selectedClip.id, fx.id, { enabled: !fx.enabled })
                    }
                    title={fx.enabled ? "Disable" : "Enable"}
                  >
                    {fx.enabled ? "●" : "○"}
                  </button>
                  <span className="fx-item-name">{def?.label || fx.kind}</span>
                  <div className="fx-item-actions">
                    <button
                      className="btn tiny"
                      disabled={i === 0}
                      onClick={() => moveEffect(selectedClip.id, fx.id, -1)}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      className="btn tiny"
                      disabled={i === arr.length - 1}
                      onClick={() => moveEffect(selectedClip.id, fx.id, 1)}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="btn tiny danger"
                      onClick={() => removeEffect(selectedClip.id, fx.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {def?.hasAmount && (
                  <Slider
                    label={`Amount · ${Math.round(fx.amount)}`}
                    min={0}
                    max={100}
                    value={fx.amount}
                    onChange={(v) =>
                      updateEffect(selectedClip.id, fx.id, { amount: v })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      </InspSection>
    </div>
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
    setUploadingMusic,
    projectId,
    patchClip,
    patchMusic,
    setMusic,
    setMusicTracks,
    mixerSolo,
    setMixerSolo,
    setAssets,
    addKeyframe,
    detachClipAudio,
    relinkClipAudio,
    onMusicFile,
    onExtractAudioFromVideo,
    onImportYoutubeAudio,
    pushToast,
    markers,
    addMarker,
    patchMarker,
    removeMarker,
    addAdjustmentLayer,
  } = panelCtx(ctx);
  return (
    <div className="tool">
                      <PanelBlock
                        title="Mixer"
                        hint="Faders for the selected clip, music, and SFX. Solo hears one bus."
                        filterMatch={inspMatch(ctx.inspSearch || "", "mixer", "bus", "fader", "audio", "volume")}
                      >
                        <AudioMixerStrip
                          channels={[
                            ...(selectedClip && selectedAsset?.kind !== "image"
                              ? [
                                  {
                                    id: "clip",
                                    label: "Clip",
                                    color: "#29c3a9",
                                    volume: selectedClip.volume ?? 1,
                                    muted: (selectedClip.volume ?? 1) < 0.01,
                                    solo: mixerSolo === "clip",
                                    onVolume: (v: number) =>
                                      patchClip(selectedClip.id, { volume: v }),
                                    onMute: () =>
                                      patchClip(selectedClip.id, {
                                        volume: (selectedClip.volume ?? 1) < 0.01 ? 1 : 0,
                                      }),
                                    onSolo: () =>
                                      setMixerSolo((s) => (s === "clip" ? null : "clip")),
                                  },
                                ]
                              : []),
                            ...(music
                              ? [
                                  {
                                    id: "music",
                                    label: "Music",
                                    color: "#5daeff",
                                    volume: music.volume ?? 0.8,
                                    muted: (music.volume ?? 0.8) < 0.01,
                                    solo: mixerSolo === "music",
                                    onVolume: (v: number) => patchMusic({ volume: v }),
                                    onMute: () =>
                                      patchMusic({
                                        volume: (music.volume ?? 0.8) < 0.01 ? 0.8 : 0,
                                      }),
                                    onSolo: () =>
                                      setMixerSolo((s) => (s === "music" ? null : "music")),
                                  },
                                ]
                              : []),
                            ...musicTracks.map((mt, i) => ({
                              id: `sfx-${i}`,
                              label: `SFX ${i + 1}`,
                              color: "#f4b942",
                              volume: mt.volume ?? 0.8,
                              muted: (mt.volume ?? 0.8) < 0.01,
                              solo: mixerSolo === `sfx-${i}`,
                              onVolume: (v: number) =>
                                setMusicTracks((prev) =>
                                  prev.map((m, j) => (j === i ? { ...m, volume: v } : m)),
                                ),
                              onMute: () =>
                                setMusicTracks((prev) =>
                                  prev.map((m, j) =>
                                    j === i
                                      ? { ...m, volume: (m.volume ?? 0.8) < 0.01 ? 0.8 : 0 }
                                      : m,
                                  ),
                                ),
                              onSolo: () =>
                                setMixerSolo((s) =>
                                  s === `sfx-${i}` ? null : `sfx-${i}`,
                                ),
                            })),
                          ]}
                        />
                      </PanelBlock>
                      {selectedClip && selectedAsset?.kind !== "image" && (
                        <PanelBlock
                          title="Clip audio"
                          hint="Loudness, tone, and cleanup for this clip’s own sound."
                          filterMatch={inspMatch(ctx.inspSearch || "", "volume", "eq", "bass", "gate", "compress", "audio", "fade")}
                        >
                          <Slider
                            label="Volume"
                            hint="0 = mute, 1 = normal, above 1 = boost."
                            min={0}
                            max={2}
                            value={selectedClip.volume}
                            onChange={(v) => patchClip(selectedClip.id, { volume: v })}
                          />
                          <button
                            className="btn tiny"
                            onClick={() => addKeyframe(selectedClip.id, "volume")}
                            title="Add volume keyframe at playhead"
                          >
                            ◆ Volume keyframe
                          </button>
                          <p className="tool-label">Tone</p>
                          <Slider
                            label="Bass"
                            hint="Low frequencies."
                            min={-20}
                            max={20}
                            value={selectedClip.bass ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { bass: v })}
                          />
                          <Slider
                            label="Treble"
                            hint="High frequencies."
                            min={-20}
                            max={20}
                            value={selectedClip.treble ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { treble: v })}
                          />
                          <Slider
                            label="Balance"
                            hint="−1 left, 0 center, +1 right."
                            min={-1}
                            max={1}
                            value={selectedClip.balance ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { balance: v })}
                          />
                          <label className="seg-row">
                            <span>Normalize</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedClip.normalize)}
                              onChange={(e) =>
                                patchClip(selectedClip.id, { normalize: e.target.checked })
                              }
                            />
                          </label>
                          <p className="tool-label">Cleanup</p>
                          <Slider
                            label="Compressor"
                            hint="Evens out loud and quiet parts."
                            min={0}
                            max={1}
                            value={selectedClip.compress ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { compress: v })}
                          />
                          <Slider
                            label="Denoise"
                            hint="Reduces hiss and background noise."
                            min={0}
                            max={1}
                            value={selectedClip.denoise ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { denoise: v })}
                          />
                          <Slider
                            label="Noise gate"
                            hint="Cuts sound below a threshold (room tone)."
                            min={0}
                            max={1}
                            value={selectedClip.gate ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { gate: v })}
                          />
                          <label className="seg-row">
                            <span>Limiter</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedClip.limiter)}
                              onChange={(e) =>
                                patchClip(selectedClip.id, { limiter: e.target.checked })
                              }
                            />
                          </label>
                          <p className="tool-hint">These bake into export.</p>
                          {selectedAsset?.kind === "video" && selectedAsset.hasAudio && (
                            <button
                              className="btn tiny wide"
                              onClick={() => detachClipAudio(selectedClip.id)}
                              title="Move this clip's audio to the music lane (linked)"
                            >
                              Detach audio
                            </button>
                          )}
                          {music?.linkedClipId === selectedClip.id && (
                            <button
                              className="btn tiny wide"
                              onClick={() => relinkClipAudio(selectedClip.id)}
                              title="Restore audio onto the clip"
                            >
                              Re-link audio
                            </button>
                          )}
                          <Slider
                            label="Fade in"
                            hint="Soft start in seconds."
                            min={0}
                            max={3}
                            value={selectedClip.fadeIn}
                            onChange={(v) => patchClip(selectedClip.id, { fadeIn: v })}
                          />
                          <Slider
                            label="Fade out"
                            hint="Soft end in seconds."
                            min={0}
                            max={3}
                            value={selectedClip.fadeOut}
                            onChange={(v) => patchClip(selectedClip.id, { fadeOut: v })}
                          />
                        </PanelBlock>
                      )}

                      <InspSection
                        id="bg-music"
                        title="Background music"
                        filterMatch={inspMatch(ctx.inspSearch || "", "music", "duck", "sfx")}
                      >
                      {music && musicAsset ? (
                        <>
                          <div className="music-chip">
                            <span className="music-ico">♪</span>
                            <span className="music-name">
                              {musicAsset.name}
                              {music.linkedClipId ? " · linked A/V" : ""}
                            </span>
                            <button className="music-remove" title="Remove music" onClick={() => setMusic(null)}>
                              ✕
                            </button>
                          </div>
                          {music.linkedClipId && (
                            <div className="chip-row">
                              <button
                                className="chip"
                                onClick={() => relinkClipAudio(music.linkedClipId)}
                              >
                                <span>Re-link to clip</span>
                              </button>
                              <button
                                className="chip"
                                onClick={() =>
                                  setMusic((m) => (m ? { ...m, linkedClipId: undefined } : m))
                                }
                                title="Keep music but stop following the clip"
                              >
                                <span>Break link</span>
                              </button>
                            </div>
                          )}
                          <Slider
                            label="Music volume"
                            min={0}
                            max={2}
                            value={music.volume}
                            onChange={(v) => patchMusic({ volume: v })}
                          />
                          <Slider
                            label="Duck"
                            min={0}
                            max={1}
                            value={music.duck ?? 0}
                            onChange={(v) => patchMusic({ duck: v })}
                          />
                          <Slider
                            label="Start at"
                            min={0}
                            max={Math.max(1, total)}
                            value={music.start}
                            onChange={(v) => patchMusic({ start: v })}
                          />
                          <Slider
                            label="Music fade in"
                            min={0}
                            max={5}
                            value={music.fadeIn}
                            onChange={(v) => patchMusic({ fadeIn: v })}
                          />
                          <Slider
                            label="Music fade out"
                            min={0}
                            max={5}
                            value={music.fadeOut}
                            onChange={(v) => patchMusic({ fadeOut: v })}
                          />
                          <p className="tool-hint">Drag the music bar on the timeline to move or trim it.</p>
                        </>
                      ) : null}
                      <div className="audio-import-stack">
                        <p className="tool-label">{music ? "Add more audio" : "Add audio"}</p>
                        <label className="btn wide">
                          {uploadingMusic ? "Uploading…" : "Audio file"}
                          <input
                            type="file"
                            accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
                            hidden
                            disabled={uploadingMusic}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onMusicFile(f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {onExtractAudioFromVideo && (
                          <label className="btn wide ghost">
                            {uploadingMusic ? "Working…" : "Extract from video"}
                            <input
                              type="file"
                              accept="video/*,.mp4,.mov,.webm,.mkv,.m4v"
                              hidden
                              disabled={uploadingMusic}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void onExtractAudioFromVideo(f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                        {onImportYoutubeAudio && (
                          <YoutubeAudioImport
                            busy={uploadingMusic}
                            onImport={onImportYoutubeAudio}
                          />
                        )}
                      </div>
                      {music && (
                        <>
                          <p className="tool-label">Extra music lanes ({musicTracks.length})</p>
                          {musicTracks.map((m, i) => {
                            const a = assetById.get(m.assetId);
                            return (
                              <div key={`${m.assetId}-${i}`}>
                                <div className="music-chip">
                                  <span className="music-ico">♪</span>
                                  <span className="music-name">{a?.name || "Track"}</span>
                                  <button
                                    className="music-remove"
                                    title="Remove lane"
                                    onClick={() =>
                                      setMusicTracks((prev) => prev.filter((_, j) => j !== i))
                                    }
                                  >
                                    ✕
                                  </button>
                                </div>
                                <Slider
                                  label="Volume"
                                  min={0}
                                  max={2}
                                  value={m.volume}
                                  onChange={(v) =>
                                    setMusicTracks((prev) =>
                                      prev.map((t, j) => (j === i ? { ...t, volume: v } : t)),
                                    )
                                  }
                                />
                                <Slider
                                  label="Duck"
                                  min={0}
                                  max={1}
                                  value={m.duck ?? 0}
                                  onChange={(v) =>
                                    setMusicTracks((prev) =>
                                      prev.map((t, j) => (j === i ? { ...t, duck: v } : t)),
                                    )
                                  }
                                />
                              </div>
                            );
                          })}
                          <label className="btn tiny wide">
                            ＋ Add music lane
                            <input
                              type="file"
                              accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
                              hidden
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                setUploadingMusic(true);
                                try {
                                  const form = new FormData();
                                  form.append("file", f);
                                  const res = await fetch(`/api/editor/project/${projectId}/asset`, {
                                    method: "POST",
                                    body: form,
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || "Upload failed");
                                  const asset = data.asset as ProjectAsset;
                                  setAssets((prev) => [...prev, asset]);
                                  setMusicTracks((prev) => [
                                    ...prev,
                                    {
                                      assetId: asset.id,
                                      start: 0,
                                      inPoint: 0,
                                      outPoint: asset.duration || 30,
                                      volume: 0.7,
                                      fadeIn: 0.5,
                                      fadeOut: 1,
                                    },
                                  ]);
                                } catch (err) {
                                  pushToast(
                                    err instanceof Error ? err.message : "Upload failed",
                                    "error",
                                  );
                                } finally {
                                  setUploadingMusic(false);
                                  e.target.value = "";
                                }
                              }}
                            />
                          </label>
                        </>
                      )}
                      </InspSection>

                      {(addMarker || (markers && markers.length > 0)) && (
                        <>
                          <hr className="tool-sep" />
                          <p className="tool-label">Markers</p>
                          {addMarker && (
                            <button className="btn tiny wide" onClick={addMarker}>
                              ＋ Add marker at playhead
                            </button>
                          )}
                          {addAdjustmentLayer && (
                            <button className="btn tiny wide" onClick={addAdjustmentLayer}>
                              ▨ Add adjustment layer (V2)
                            </button>
                          )}
                          {markers && markers.length > 0 && (
                            <div className="marker-list">
                              {markers.map((mk) => (
                                <div key={mk.id} className="marker-row">
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={Number(mk.t.toFixed(2))}
                                    onChange={(e) =>
                                      patchMarker?.(mk.id, {
                                        t: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                    aria-label="Marker time"
                                    title="Time (seconds)"
                                  />
                                  <input
                                    value={mk.label}
                                    onChange={(e) =>
                                      patchMarker?.(mk.id, { label: e.target.value })
                                    }
                                    aria-label="Marker label"
                                  />
                                  <input
                                    type="color"
                                    value={mk.color || "#e2a03f"}
                                    onChange={(e) =>
                                      patchMarker?.(mk.id, { color: e.target.value })
                                    }
                                    aria-label="Marker color"
                                    title="Color"
                                  />
                                  <button
                                    className="btn tiny"
                                    title="Delete marker"
                                    onClick={() => removeMarker?.(mk.id)}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
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
    toggleFav,
    patchClip,
  } = panelCtx(ctx);
  return (
    <div className="tool">
                      <InspSection id="tr-preview" title="Transition browser" filterMatch={inspMatch(ctx.inspSearch || "", "transition", "preview", "crossfade")}>
                      <p className="tool-hint">
                        {selectedClip
                          ? "Each card previews with two photos — click to apply on the selected clip."
                          : "Select a clip, then click a transition."}
                      </p>
                      <input
                        className="fx-search"
                        placeholder="Search transitions…"
                        value={trSearch}
                        onChange={(e) => setTrSearch(e.target.value)}
                      />
                      {favTr.length > 0 && !trSearch.trim() && (
                        <>
                          <p className="tool-sublabel">★ Favorites</p>
                          <div className="chip-row">
                            {TRANSITIONS.filter((t) => favTr.includes(t.id)).map((tr) => (
                              <TransitionChip
                                key={tr.id}
                                tr={tr}
                                active={
                                  previewTransition === tr.id ||
                                  selectedClip?.transition === tr.id
                                }
                                fav
                                onPick={() => {
                                  setPreviewTransition(tr.id);
                                  setDemoKey((k) => k + 1);
                                  if (selectedClip) {
                                    patchClip(selectedClip.id, { transition: tr.id });
                                  }
                                }}
                                onFav={() => toggleFav(tr.id)}
                              />
                            ))}
                          </div>
                        </>
                      )}
                      <div className="cc-grid cc-grid-3">
                        {TRANSITIONS.filter(
                          (t) =>
                            t.id !== "none" &&
                            (!trSearch.trim() || t.label.toLowerCase().includes(trSearch.toLowerCase())),
                        ).map((tr) => {
                          const active =
                            previewTransition === tr.id || selectedClip?.transition === tr.id;
                          return (
                            <button
                              key={tr.id}
                              type="button"
                              className={active ? "cc-card fx-photo-card on" : "cc-card fx-photo-card"}
                              onClick={() => {
                                setPreviewTransition(tr.id);
                                setDemoKey((k) => k + 1);
                                if (selectedClip) {
                                  patchClip(selectedClip.id, { transition: tr.id });
                                }
                              }}
                            >
                              <span className="cc-card-thumb">
                                <TransitionPreview kind={tr.id} />
                              </span>
                              <span className="cc-card-label">{tr.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      </InspSection>

                      {selectedClip && (
                        <InspSection id="tr-current" title="Current clip" filterMatch={inspMatch(ctx.inspSearch || "", "length", "duration", "cut")}>
                          <p className="tool-label">Current clip transition</p>
                          <div className="chip-row">
                            <button
                              className={selectedClip.transition === "none" ? "chip on" : "chip"}
                              onClick={() => patchClip(selectedClip.id, { transition: "none" })}
                            >
                              <span>Cut</span>
                            </button>
                            {selectedClip.transition !== "none" && (
                              <span className="chip on">
                                <span>{TRANSITIONS.find((t) => t.id === selectedClip.transition)?.label}</span>
                              </span>
                            )}
                          </div>
                          <Slider
                            label="Transition length"
                            min={0.2}
                            max={2}
                            value={selectedClip.transitionDuration}
                            onChange={(v) => patchClip(selectedClip.id, { transitionDuration: v })}
                          />
                        </InspSection>
                      )}
      <p className="tool-hint">Transitions play into the next clip and render on export.</p>
    </div>
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
  } = panelCtx(ctx);
  if (!selectedClip || tab === "text" || tab === "transitions") return null;
  return (
    <div className="inspector-actions">
      <button className="btn tiny" onClick={() => moveClip(selectedClip.id, -1)}>
        Move left
      </button>
      <button className="btn tiny" onClick={() => moveClip(selectedClip.id, 1)}>
        Move right
      </button>
      <button className="btn tiny" onClick={() => duplicateClip(selectedClip.id)}>
        Duplicate
      </button>
      <button
        className="btn tiny"
        onClick={() => {
          const lane = clipLane(selectedClip);
          const next = lane === 0 ? 1 : lane === 1 ? 2 : 0;
          moveClipToLane(selectedClip.id, next);
        }}
        title="Cycle track lane V1 → V2 → V3 → V1"
      >
        {clipLane(selectedClip) === 0
          ? "To V2"
          : clipLane(selectedClip) === 1
            ? "To V3"
            : "To V1"}
      </button>
      <button className="btn tiny danger" onClick={() => deleteClip(selectedClip.id)}>
        Delete
      </button>
    </div>
  );
}

function ClipLayersSection({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedClip,
    selectedAsset,
    assets,
    assetById,
    addClipLayer,
    uploadClipLayerFile,
    renameClipLayer,
    removeClipLayer,
    thumbUrl,
  } = panelCtx(ctx);
  const [layerSearch, setLayerSearch] = useState("");
  const [picking, setPicking] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  const layers = selectedClip?.layers || [];
  const nextNum = layers.length + 1;
  const q = layerSearch.trim().toLowerCase();
  const mediaAssets = assets.filter((a) => a.kind === "video" || a.kind === "image");

  if (!selectedClip || !addClipLayer) return null;

  const base = {
    id: "__base",
    name: selectedAsset?.filename?.replace(/\.[^.]+$/, "") || "Base",
    assetId: selectedClip.assetId || undefined,
    enabled: true as boolean | undefined,
    isBase: true as const,
    index: 1,
  };
  const extras = layers.map((l, i) => ({
    ...l,
    isBase: false as const,
    index: i + 2,
  }));
  const rows = [base, ...extras].filter(
    (r) => !q || r.name.toLowerCase().includes(q) || `layer #${r.index}`.includes(q),
  );

  function beginAdd() {
    setDraftName(`Layer #${nextNum}`);
    setPicking(true);
  }

  async function addFromAsset(assetId: string) {
    addClipLayer(selectedClip.id, assetId, draftName.trim() || `Layer #${nextNum}`);
    setPicking(false);
    setDraftName("");
  }

  async function addFromFile(file: File | undefined) {
    if (!file || !uploadClipLayerFile) return;
    setBusy(true);
    try {
      await uploadClipLayerFile(
        selectedClip.id,
        file,
        draftName.trim() || `Layer #${nextNum}`,
      );
      setPicking(false);
      setDraftName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelBlock
      title={`Layers · ${1 + layers.length}`}
      hint="Stack video or photos on this clip. Every new layer needs real media from a file or the library."
      filterMatch={inspMatch(ctx.inspSearch || "", "layer", "overlay", "stack")}
    >
      <div className="clip-layers">
        <div className="clip-layers-toolbar">
          <input
            className="clip-layers-search"
            placeholder="Search layers…"
            value={layerSearch}
            onChange={(e) => setLayerSearch(e.target.value)}
            aria-label="Search layers"
          />
          <button
            type="button"
            className="clip-layer-icon-btn add"
            title="Add layer from file or library"
            onClick={beginAdd}
          >
            +
          </button>
        </div>

        {picking && (
          <div className="clip-layer-picker">
            <input
              className="clip-layer-name-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={`Layer #${nextNum}`}
              aria-label="New layer name"
            />
            <label className={`btn tiny${busy ? " disabled" : ""}`}>
              {busy ? "Uploading…" : "From file"}
              <input
                type="file"
                accept="video/*,image/*"
                hidden
                disabled={busy}
                onChange={(e) => {
                  void addFromFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="btn tiny ghost"
              onClick={() => {
                setPicking(false);
                setDraftName("");
              }}
            >
              Cancel
            </button>
            <p className="tool-hint">Or pick from library:</p>
            <div className="clip-layer-lib">
              {mediaAssets.length === 0 ? (
                <p className="tool-hint">No media yet — use From file.</p>
              ) : (
                mediaAssets.map((a) => {
                  const thumb = thumbUrl
                    ? thumbUrl(a, 0, 64)
                    : a.kind === "image" && ctx.assetUrl
                      ? ctx.assetUrl(a)
                      : null;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="clip-layer-lib-card"
                      title={a.filename}
                      onClick={() => void addFromAsset(a.id)}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" draggable={false} />
                      ) : (
                        <span>{a.kind === "image" ? "IMG" : "VID"}</span>
                      )}
                      <em>{a.filename.replace(/\.[^.]+$/, "").slice(0, 16)}</em>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="clip-layers-list">
          {rows.length === 0 ? (
            <p className="tool-hint">No layers match.</p>
          ) : (
            rows.map((row) => {
              const asset = row.assetId ? assetById.get(row.assetId) : null;
              const thumb =
                asset && thumbUrl
                  ? thumbUrl(asset, 0, 72)
                  : asset?.kind === "image" && ctx.assetUrl
                    ? ctx.assetUrl(asset)
                    : null;
              return (
                <div
                  key={row.id}
                  className={`clip-layer-row${row.enabled === false ? " off" : ""}${row.isBase ? " base" : ""}`}
                >
                  <span className="clip-layer-num" title={`Layer ${row.index}`}>
                    {row.index}
                  </span>
                  <div className="clip-layer-thumb" title={asset?.filename || row.name}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" draggable={false} />
                    ) : (
                      <span className="clip-layer-thumb-empty">{row.index}</span>
                    )}
                  </div>
                  <div className="clip-layer-meta">
                    {row.isBase ? (
                      <span className="clip-layer-label">{row.name}</span>
                    ) : (
                      <input
                        className="clip-layer-label-input"
                        value={row.name}
                        onChange={(e) => renameClipLayer?.(selectedClip.id, row.id, e.target.value)}
                        aria-label="Layer name"
                      />
                    )}
                    <span className="clip-layer-sub">
                      {asset
                        ? `${asset.kind === "image" ? "Photo" : "Video"} · ${asset.filename}`
                        : row.isBase
                          ? "Base clip"
                          : "No media"}
                    </span>
                  </div>
                  {!row.isBase && (
                    <button
                      type="button"
                      className="clip-layer-icon-btn del"
                      title="Delete layer"
                      onClick={() => removeClipLayer?.(selectedClip.id, row.id)}
                    >
                      −
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </PanelBlock>
  );
}

/** Clip tab — layers only. */
export function ClipPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const { selectedClip, selectedText, patchText } = panelCtx(ctx);
  if (selectedText && !selectedClip) {
    return (
      <div className="tool">
        <p className="tool-hint">Text selected — edit it in the Text tab.</p>
        <Slider
          label="Start"
          hint="When the title appears on the timeline."
          min={0}
          max={120}
          value={selectedText.start}
          onChange={(v) => patchText(selectedText.id, { start: v })}
        />
        <Slider
          label="Duration"
          hint="How long the title stays on screen."
          min={0.2}
          max={60}
          value={selectedText.duration}
          onChange={(v) => patchText(selectedText.id, { duration: v })}
        />
      </div>
    );
  }
  if (!selectedClip) {
    return (
      <div className="tool">
        <p className="tool-hint">Select a clip to manage its layers.</p>
      </div>
    );
  }
  return (
    <div className="tool">
      <ClipLayersSection ctx={ctx} />
    </div>
  );
}

export function ExtraOptionsPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    useProxy = true,
    onToggleProxy,
    snapEnabled = true,
    setSnapEnabled,
    magnetic = false,
    setMagnetic,
    rippleEnabled = false,
    setRippleEnabled,
    freeV1 = false,
    onToggleFreeV1,
  } = panelCtx(ctx);

  const toggles: {
    id: string;
    label: string;
    hint: string;
    on: boolean;
    set?: () => void;
  }[] = [
    {
      id: "proxy",
      label: "Proxy preview",
      hint: "Lighter files while scrubbing. Off = full quality in the monitor.",
      on: useProxy,
      set: onToggleProxy,
    },
    {
      id: "snap",
      label: "Snap",
      hint: "Clip edges pull to nearby clips and the playhead.",
      on: snapEnabled,
      set: setSnapEnabled ? () => setSnapEnabled((s) => !s) : undefined,
    },
    {
      id: "magnet",
      label: "Magnet",
      hint: "Stronger snap while dragging; gaps tend to close on release.",
      on: magnetic,
      set: setMagnetic ? () => setMagnetic((m) => !m) : undefined,
    },
    {
      id: "ripple",
      label: "Ripple",
      hint: "Deleting or shortening slides later clips left to close gaps.",
      on: rippleEnabled,
      set: setRippleEnabled ? () => setRippleEnabled((r) => !r) : undefined,
    },
    {
      id: "free",
      label: freeV1 ? "Free place (V1)" : "Pack gapless (V1)",
      hint: "Free lets main-track clips sit anywhere. Pack keeps them back-to-back.",
      on: freeV1,
      set: onToggleFreeV1,
    },
  ];

  return (
    <div className="tool">
      <InspSection
        id="extra-opts"
        title="Extra options"
        hint="Timeline behavior that used to crowd the bottom bar — toggle what you need."
        filterMatch={inspMatch(ctx.inspSearch || "", "proxy", "snap", "magnet", "ripple", "extra")}
      >
        <div className="extra-opts-list">
          {toggles.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.on ? "extra-opt on" : "extra-opt"}
              onClick={() => t.set?.()}
              disabled={!t.set}
            >
              <span className="extra-opt-top">
                <strong>{t.label}</strong>
                <em>{t.on ? "On" : "Off"}</em>
              </span>
              <span className="extra-opt-hint">{t.hint}</span>
            </button>
          ))}
        </div>
      </InspSection>
    </div>
  );
}

export function InspectorTabPanels({ ctx }: { ctx: InspectorPanelCtx }) {
  const { tab } = ctx;
  if (tab === "clip") return <ClipPanel ctx={ctx} />;
  if (tab === "transform" || tab === "animation") return <TransformPanel ctx={ctx} />;
  if (tab === "color") return <EffectsPanel ctx={ctx} />;
  if (tab === "audio") return <AudioPanel ctx={ctx} />;
  if (tab === "effects" || tab === "fx") return <FxPanel ctx={ctx} />;
  if (tab === "text") return <TextPanel ctx={ctx} />;
  if (tab === "transitions") return <TransitionsPanel ctx={ctx} />;
  if (tab === "extra") return <ExtraOptionsPanel ctx={ctx} />;
  return <ClipPanel ctx={ctx} />;
}

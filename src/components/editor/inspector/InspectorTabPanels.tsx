"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";
import { BezierEditor } from "@/components/editor/BezierEditor";
import { ColorWheelsRow } from "@/components/editor/ColorWheels";
import { TransitionChip, TransitionDemo } from "@/components/editor/TransitionWidgets";
import {
  COLOR_PRESETS,
  DEFAULT_TRANSFORM,
  EFFECT_DEFS,
  KEYFRAME_EASES,
  STICKER_PRESETS,
  STICKER_PACK,
  TEXT_FONTS,
  TEXT_TEMPLATES,
  TRANSITION_DEFS,
  clipLane,
  clipLength,
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
  type TimelineMarker,
  type ClipTransform,
  type TransitionKind,
} from "@/lib/editor-types";
import { InspSection, inspMatch } from "@/components/editor/InspSection";
import { AudioMixerStrip } from "@/components/editor/AudioMixerStrip";
import { KeyframeGraph } from "@/components/editor/KeyframeGraph";

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
      <InspSection
        id="speed"
        title={`Speed · ${(selectedClip.speed || 1).toFixed(2)}×`}
        filterMatch={inspMatch(ctx.inspSearch || "", "speed", "playback")}
      >
      <Slider
        label="Playback speed"
        min={0.25}
        max={4}
        value={selectedClip.speed || 1}
        onChange={(v) => patchClip(selectedClip.id, { speed: v })}
      />
      <div className="chip-row">
        {[0.5, 1, 1.5, 2].map((s) => (
          <button
            key={s}
            className={Math.abs((selectedClip.speed || 1) - s) < 0.01 ? "chip on" : "chip"}
            onClick={() => patchClip(selectedClip.id, { speed: s })}
          >
            <span>{s}×</span>
          </button>
        ))}
      </div>
      {ctx.applySpeedRamp && (
        <>
          <p className="tool-label" style={{ marginTop: "0.55rem" }}>
            Speed ramps
          </p>
          <div className="chip-row">
            {(
              [
                ["ramp-in", "In"],
                ["ramp-out", "Out"],
                ["ramp-up", "Up"],
                ["ramp-down", "Down"],
                ["slow-mo", "Slow-mo"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className="chip"
                title={kind}
                onClick={() => ctx.applySpeedRamp?.(selectedClip.id, kind)}
              >
                <span>{label}</span>
              </button>
            ))}
          </div>
          <p className="tool-hint">Splits the clip into speed steps (exports with existing pipeline).</p>
        </>
      )}
      </InspSection>

      <InspSection
        id="color-basic"
        title="Color"
        filterMatch={inspMatch(ctx.inspSearch || "", "color", "brightness", "contrast", "saturation", "vignette", "sharpen")}
      >
      <p className="tool-label">Color presets</p>
      <div className="preset-grid">
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
        min={0}
        max={2}
        value={selectedClip.color.brightness}
        onChange={(v) => patchColor(selectedClip.id, { brightness: v, preset: "custom" })}
      />
      <Slider
        label="Contrast"
        min={0}
        max={2}
        value={selectedClip.color.contrast}
        onChange={(v) => patchColor(selectedClip.id, { contrast: v, preset: "custom" })}
      />
      <Slider
        label="Saturation"
        min={0}
        max={3}
        value={selectedClip.color.saturation}
        onChange={(v) => patchColor(selectedClip.id, { saturation: v, preset: "custom" })}
      />
      <Slider
        label="Sharpen"
        min={0}
        max={2}
        value={selectedClip.color.sharpen}
        onChange={(v) => patchColor(selectedClip.id, { sharpen: v, preset: "custom" })}
      />
      <Slider
        label="Vignette"
        min={0}
        max={1}
        value={selectedClip.color.vignette}
        onChange={(v) => patchColor(selectedClip.id, { vignette: v, preset: "custom" })}
      />
      </InspSection>

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

      <InspSection
        id="lgg"
        title="Lift / Gamma / Gain"
        filterMatch={inspMatch(ctx.inspSearch || "", "lift", "gamma", "gain", "wheels")}
      >
      <ColorWheelsRow
        lift={selectedClip.color.lift ?? 0}
        gamma={selectedClip.color.gamma ?? 0}
        gain={selectedClip.color.gain ?? 0}
        onChange={(p) => patchColor(selectedClip.id, { ...p, preset: "custom" })}
      />
      <p className="tool-hint">Double-click a wheel to reset. Bakes into curves on export.</p>
      </InspSection>

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
    return <p className="tool-hint">Select a clip on the timeline.</p>;
  }
  return (
    <div className="tool">
      {(() => {
        const t = { ...DEFAULT_TRANSFORM, ...(selectedClip.transform || {}) };
        const q = ctx.inspSearch || "";
        return (
          <>
            <InspSection
              id="xform-pos"
              title="Transform"
              filterMatch={inspMatch(q, "transform", "position", "scale", "rotation", "opacity")}
            >
            <Slider
              label="Position X"
              min={-1}
              max={1}
              value={t.x}
              onChange={(v) => patchTransform(selectedClip.id, { x: v })}
            />
            <Slider
              label="Position Y"
              min={-1}
              max={1}
              value={t.y}
              onChange={(v) => patchTransform(selectedClip.id, { y: v })}
            />
            <Slider
              label="Scale X"
              min={0.1}
              max={3}
              value={t.scaleX}
              onChange={(v) => patchTransform(selectedClip.id, { scaleX: v })}
            />
            <Slider
              label="Scale Y"
              min={0.1}
              max={3}
              value={t.scaleY}
              onChange={(v) => patchTransform(selectedClip.id, { scaleY: v })}
            />
            <div className="chip-row">
              <button
                className="chip"
                onClick={() =>
                  patchTransform(selectedClip.id, {
                    scaleY: t.scaleX,
                  })
                }
              >
                <span>Lock scale</span>
              </button>
              <button
                className="chip"
                onClick={() =>
                  patchTransform(selectedClip.id, {
                    scaleX: 1,
                    scaleY: 1,
                  })
                }
              >
                <span>100%</span>
              </button>
            </div>
            <Slider
              label="Rotation"
              min={-180}
              max={180}
              value={t.rotation}
              onChange={(v) => patchTransform(selectedClip.id, { rotation: v })}
            />
            <Slider
              label="Opacity"
              min={0}
              max={1}
              value={t.opacity}
              onChange={(v) => patchTransform(selectedClip.id, { opacity: v })}
            />
            </InspSection>

            <InspSection
              id="xform-kf"
              title="Keyframes"
              filterMatch={inspMatch(q, "keyframe", "animation", "ease", "bezier", "graph")}
            >
            <div className="chip-row">
              {(
                [
                  ["opacity", "Opacity"],
                  ["x", "X"],
                  ["y", "Y"],
                  ["scaleX", "ScaleX"],
                  ["scaleY", "ScaleY"],
                  ["rotation", "Rot"],
                ] as [KeyframeProp, string][]
              ).map(([prop, label]) => (
                <button
                  key={prop}
                  className="chip"
                  onClick={() => addKeyframe(selectedClip.id, prop)}
                  title={`Add ${label} keyframe at playhead`}
                >
                  <span>◆ {label}</span>
                </button>
              ))}
            </div>
            <div className="chip-row">
              <button
                className="chip"
                onClick={() => removeNearbyKeyframe(selectedClip.id)}
                title="Remove keyframe near playhead"
              >
                <span>◇ Clear near</span>
              </button>
              <button
                className="chip"
                onClick={() => copyKeyframes(selectedClip.id)}
              >
                <span>Copy KFs</span>
              </button>
              <button
                className="chip"
                onClick={() => pasteKeyframes(selectedClip.id)}
              >
                <span>Paste KFs</span>
              </button>
            </div>
            <KeyframeGraph
              keyframes={selectedClip.keyframes || []}
              duration={clipLength(selectedClip)}
            />
            <p className="tool-label">Interpolation</p>
            <div className="chip-row">
              {KEYFRAME_EASES.map((e) => (
                <button
                  key={e.id}
                  className={defaultEase === e.id ? "chip on" : "chip"}
                  onClick={() => setAllKeyframeEase(selectedClip.id, e.id)}
                  title="Apply ease to all keyframes on this clip"
                >
                  <span>{e.label}</span>
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
                            {(selectedClip.keyframes || []).length === 1 ? "" : "s"} · {defaultEase} ·
                            drag diamonds · opacity/volume/x/y/scale/rotation/brightness bake on export
                          </p>
            </InspSection>
            <button
              className="btn tiny wide"
              onClick={() =>
                patchClip(selectedClip.id, { transform: { ...DEFAULT_TRANSFORM } })
              }
            >
              Reset transform
            </button>
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
      <div className="fx-library">
        {EFFECT_DEFS.filter(
          (d) =>
            !fxSearch.trim() ||
            d.label.toLowerCase().includes(fxSearch.toLowerCase()) ||
            d.hint.toLowerCase().includes(fxSearch.toLowerCase()),
        ).map((d) => (
          <button
            key={d.kind}
            className="fx-add"
            onClick={() => addEffect(selectedClip.id, d.kind)}
            title={d.hint}
          >
            <span className="fx-add-label">{d.label}</span>
            <span className="fx-add-plus">＋</span>
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
    pushToast,
    markers,
    addMarker,
    patchMarker,
    removeMarker,
    addAdjustmentLayer,
  } = panelCtx(ctx);
  return (
    <div className="tool">
                      <InspSection
                        id="mixer"
                        title="Mixer"
                        filterMatch={inspMatch(ctx.inspSearch || "", "mixer", "bus", "fader")}
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
                      </InspSection>
                      {selectedClip && selectedAsset?.kind !== "image" && (
                        <InspSection
                          id="clip-audio"
                          title="Clip audio"
                          filterMatch={inspMatch(ctx.inspSearch || "", "volume", "eq", "bass", "gate", "compress")}
                        >
                          <Slider
                            label="Volume"
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
                          <p className="tool-label">EQ & balance</p>
                          <Slider
                            label="Bass"
                            min={-20}
                            max={20}
                            value={selectedClip.bass ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { bass: v })}
                          />
                          <Slider
                            label="Treble"
                            min={-20}
                            max={20}
                            value={selectedClip.treble ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { treble: v })}
                          />
                          <Slider
                            label="Balance"
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
                          <p className="tool-label">Dynamics</p>
                          <Slider
                            label="Compressor"
                            min={0}
                            max={1}
                            value={selectedClip.compress ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { compress: v })}
                          />
                          <Slider
                            label="Denoise"
                            min={0}
                            max={1}
                            value={selectedClip.denoise ?? 0}
                            onChange={(v) => patchClip(selectedClip.id, { denoise: v })}
                          />
                          <Slider
                            label="Noise gate"
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
                          <p className="tool-hint">EQ / dynamics bake into export.</p>
                          {selectedAsset?.kind === "video" && selectedAsset.hasAudio && (
                            <button
                              className="btn tiny wide"
                              onClick={() => detachClipAudio(selectedClip.id)}
                              title="Move this clip's audio to the music lane (linked)"
                            >
                              ⤴ Detach audio (linked)
                            </button>
                          )}
                          {music?.linkedClipId === selectedClip.id && (
                            <button
                              className="btn tiny wide"
                              onClick={() => relinkClipAudio(selectedClip.id)}
                              title="Restore audio onto the clip"
                            >
                              ⤵ Re-link audio to clip
                            </button>
                          )}
                          <Slider
                            label="Fade in"
                            min={0}
                            max={3}
                            value={selectedClip.fadeIn}
                            onChange={(v) => patchClip(selectedClip.id, { fadeIn: v })}
                          />
                          <Slider
                            label="Fade out"
                            min={0}
                            max={3}
                            value={selectedClip.fadeOut}
                            onChange={(v) => patchClip(selectedClip.id, { fadeOut: v })}
                          />
                        </InspSection>
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
                      ) : (
                        <label className="btn wide">
                          {uploadingMusic ? "Uploading…" : "♪ Add background track"}
                          <input
                            type="file"
                            accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onMusicFile(f);
                            }}
                          />
                        </label>
                      )}
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

export function TextPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const {
    selectedText,
    assets,
    projectId,
    addText,
    addSticker,
    addPackSticker,
    patchText,
    deleteText,
    setAssets,
    pushToast,
  } = panelCtx(ctx);
  return (
    <div className="tool">
                      <InspSection id="text-add" title="Add text & stickers" filterMatch={inspMatch(ctx.inspSearch || "", "text", "sticker", "lottie")}>
                      <button className="btn wide primary" onClick={addText}>
                        ＋ Add text block
                      </button>
                      <p className="tool-label">Stickers</p>
                      <p className="tool-hint">
                        Shift-click an image in the media bin to place as V2 sticker/overlay.
                      </p>
                      <div className="sticker-grid">
                        {STICKER_PRESETS.map((s) => (
                          <button
                            key={s.id}
                            className="sticker-btn"
                            title={s.label}
                            onClick={() => addSticker(s.glyph)}
                          >
                            {s.glyph}
                          </button>
                        ))}
                      </div>
                      <p className="tool-label">SVG / motion pack</p>
                      <div className="sticker-pack-grid">
                        {STICKER_PACK.map((s) => (
                          <button
                            key={s.id}
                            className="sticker-pack-btn"
                            title={
                              s.lottie
                                ? `${s.label} (Lottie)`
                                : s.motion
                                  ? `${s.label} (motion)`
                                  : s.label
                            }
                            onClick={() => addPackSticker?.(s.src, s.label)}
                          >
                            {s.lottie ? (
                              <span style={{ fontSize: 18 }}>{s.label.slice(0, 1)}</span>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.src} alt={s.label} />
                            )}
                          </button>
                        ))}
                      </div>
                      </InspSection>
                      {selectedText ? (
                        <>
                          <InspSection id="text-style" title="Content & style" filterMatch={inspMatch(ctx.inspSearch || "", "font", "color", "template", "curve", "kerning")}>
                          <label className="field">
                            <span>Text</span>
                            <textarea
                              rows={2}
                              value={selectedText.text}
                              onChange={(e) => patchText(selectedText.id, { text: e.target.value })}
                            />
                          </label>
                          <p className="tool-label">Templates</p>
                          <div className="chip-row">
                            {TEXT_TEMPLATES.map((tpl) => (
                              <button
                                key={tpl.id}
                                className="chip"
                                onClick={() => patchText(selectedText.id, tpl.apply)}
                                title={`Apply ${tpl.label} preset`}
                              >
                                <span>{tpl.label}</span>
                              </button>
                            ))}
                          </div>
                          <label className="field row">
                            <span>Font</span>
                            <select
                              value={
                                selectedText.fontFile
                                  ? `file:${selectedText.fontFile}`
                                  : selectedText.font || "Arial Black"
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v.startsWith("file:")) {
                                  const filename = v.slice(5);
                                  const a = assets.find((x) => x.filename === filename);
                                  const name = a?.name.replace(/\.[^.]+$/, "") || "Custom";
                                  patchText(selectedText.id, {
                                    fontFile: filename,
                                    font: name,
                                  });
                                } else {
                                  patchText(selectedText.id, {
                                    font: v,
                                    fontFile: undefined,
                                  });
                                }
                              }}
                            >
                              {TEXT_FONTS.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                              {assets
                                .filter((a) => a.kind === "font")
                                .map((a) => (
                                  <option key={a.id} value={`file:${a.filename}`}>
                                    ↑ {a.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="btn tiny wide">
                            Upload font (.ttf / .otf)
                            <input
                              type="file"
                              accept=".ttf,.otf,.woff,.woff2"
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
                                  pushToast(data.error || "Font upload failed", "error");
                                  return;
                                }
                                const asset = data.asset as ProjectAsset;
                                setAssets((prev) => [...prev, asset]);
                                patchText(selectedText.id, {
                                  fontFile: asset.filename,
                                  font: asset.name.replace(/\.[^.]+$/, ""),
                                });
                                pushToast("Font applied", "success");
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <Slider
                            label="Font size"
                            min={0.03}
                            max={0.25}
                            value={selectedText.size}
                            onChange={(v) => patchText(selectedText.id, { size: v })}
                          />
                          <label className="field row">
                            <span>Color</span>
                            <input
                              type="color"
                              value={selectedText.color}
                              onChange={(e) => patchText(selectedText.id, { color: e.target.value })}
                            />
                          </label>
                          <div className="seg-row">
                            <span>Align</span>
                            <div className="chip-row">
                              {(["left", "center", "right"] as TextAlign[]).map((al) => (
                                <button
                                  key={al}
                                  className={selectedText.align === al ? "chip on" : "chip"}
                                  onClick={() => patchText(selectedText.id, { align: al })}
                                >
                                  <span>{al}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="seg-row">
                            <span>Animation</span>
                            <div className="chip-row">
                              {(["none", "fade", "slide"] as TextAnim[]).map((an) => (
                                <button
                                  key={an}
                                  className={selectedText.anim === an ? "chip on" : "chip"}
                                  onClick={() => patchText(selectedText.id, { anim: an })}
                                >
                                  <span>{an}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <label className="seg-row">
                            <span>Bold</span>
                            <input
                              type="checkbox"
                              checked={selectedText.bold}
                              onChange={(e) => patchText(selectedText.id, { bold: e.target.checked })}
                            />
                          </label>
                          <label className="seg-row">
                            <span>Italic</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedText.italic)}
                              onChange={(e) => patchText(selectedText.id, { italic: e.target.checked })}
                            />
                          </label>
                          <label className="seg-row">
                            <span>Underline</span>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedText.underline)}
                              onChange={(e) => patchText(selectedText.id, { underline: e.target.checked })}
                            />
                          </label>
                          <Slider
                            label="Curve"
                            min={-100}
                            max={100}
                            value={selectedText.curve ?? 0}
                            onChange={(v) => patchText(selectedText.id, { curve: v })}
                          />
                          <p className="tool-hint">Bend text along an SVG arc (− / +).</p>
                          <Slider
                            label="Kerning"
                            min={-20}
                            max={40}
                            value={selectedText.kerning ?? 0}
                            onChange={(v) => patchText(selectedText.id, { kerning: v })}
                          />
                          <p className="tool-hint">Extra glyph spacing on top of letter spacing.</p>
                          </InspSection>
                          <InspSection id="text-runs" title="Rich runs" defaultOpen={false} filterMatch={inspMatch(ctx.inspSearch || "", "runs", "rich")}>
                          <p className="tool-label">Rich runs</p>
                          <button
                            className="btn tiny wide"
                            onClick={() => {
                              const parts = selectedText.text.split(/(\s+)/).filter(Boolean);
                              if (parts.length < 2) {
                                pushToast("Type more words to split into runs", "info");
                                return;
                              }
                              patchText(selectedText.id, {
                                runs: parts.map((p, i) => ({
                                  text: p,
                                  bold: selectedText.bold,
                                  italic: i % 2 === 1 ? true : selectedText.italic,
                                  color: selectedText.color,
                                })),
                              });
                              pushToast("Split into styled runs", "success");
                            }}
                          >
                            Split words into styled runs
                          </button>
                          {(selectedText.runs || []).map((r, i) => (
                            <div key={i} className="marker-row" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
                              <input
                                value={r.text}
                                onChange={(e) => {
                                  const runs = [...(selectedText.runs || [])];
                                  runs[i] = { ...runs[i], text: e.target.value };
                                  patchText(selectedText.id, {
                                    runs,
                                    text: runs.map((x) => x.text).join(""),
                                  });
                                }}
                              />
                              <button
                                className={r.bold ? "chip on" : "chip"}
                                onClick={() => {
                                  const runs = [...(selectedText.runs || [])];
                                  runs[i] = { ...runs[i], bold: !r.bold };
                                  patchText(selectedText.id, { runs });
                                }}
                              >
                                <span>B</span>
                              </button>
                              <button
                                className={r.italic ? "chip on" : "chip"}
                                onClick={() => {
                                  const runs = [...(selectedText.runs || [])];
                                  runs[i] = { ...runs[i], italic: !r.italic };
                                  patchText(selectedText.id, { runs });
                                }}
                              >
                                <span>I</span>
                              </button>
                              <input
                                type="color"
                                value={r.color || selectedText.color}
                                onChange={(e) => {
                                  const runs = [...(selectedText.runs || [])];
                                  runs[i] = { ...runs[i], color: e.target.value };
                                  patchText(selectedText.id, { runs });
                                }}
                                aria-label="Run color"
                              />
                            </div>
                          ))}
                          {selectedText.runs?.length ? (
                            <button
                              className="btn tiny"
                              onClick={() =>
                                patchText(selectedText.id, {
                                  runs: undefined,
                                  text: selectedText.runs!.map((x) => x.text).join(""),
                                })
                              }
                            >
                              Clear runs
                            </button>
                          ) : null}
                          </InspSection>
                          <InspSection id="text-fx" title="Outline · shadow · layout" filterMatch={inspMatch(ctx.inspSearch || "", "outline", "shadow", "stroke", "layout", "opacity")}>
                          <div className="seg-row">
                            <span>Case</span>
                            <div className="chip-row">
                              {([
                                ["none", "Aa"],
                                ["upper", "AA"],
                                ["lower", "aa"],
                              ] as [TextTransform, string][]).map(([tf, lbl]) => (
                                <button
                                  key={tf}
                                  className={(selectedText.transform || "none") === tf ? "chip on" : "chip"}
                                  onClick={() => patchText(selectedText.id, { transform: tf })}
                                >
                                  <span>{lbl}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <p className="tool-label">Outline</p>
                          <Slider
                            label="Stroke width"
                            min={0}
                            max={16}
                            value={selectedText.stroke ?? 0}
                            onChange={(v) => patchText(selectedText.id, { stroke: v })}
                          />
                          <label className="field row">
                            <span>Stroke color</span>
                            <input
                              type="color"
                              value={selectedText.strokeColor || "#000000"}
                              onChange={(e) => patchText(selectedText.id, { strokeColor: e.target.value })}
                            />
                          </label>

                          <p className="tool-label">Shadow</p>
                          <Slider
                            label="Shadow depth"
                            min={0}
                            max={16}
                            value={selectedText.shadow ?? 0}
                            onChange={(v) => patchText(selectedText.id, { shadow: v })}
                          />
                          <label className="field row">
                            <span>Shadow color</span>
                            <input
                              type="color"
                              value={selectedText.shadowColor || "#000000"}
                              onChange={(e) => patchText(selectedText.id, { shadowColor: e.target.value })}
                            />
                          </label>

                          <label className="seg-row">
                            <span>Background</span>
                            <input
                              type="checkbox"
                              checked={!!selectedText.bg}
                              onChange={(e) => patchText(selectedText.id, { bg: e.target.checked })}
                            />
                          </label>
                          {selectedText.bg && (
                            <>
                              <label className="field row">
                                <span>Box color</span>
                                <input
                                  type="color"
                                  value={selectedText.bgColor || "#000000"}
                                  onChange={(e) => patchText(selectedText.id, { bgColor: e.target.value })}
                                />
                              </label>
                              <Slider
                                label="Box opacity"
                                min={0}
                                max={1}
                                value={selectedText.bgOpacity ?? 0.6}
                                onChange={(v) => patchText(selectedText.id, { bgOpacity: v })}
                              />
                            </>
                          )}

                          <p className="tool-label">Layout</p>
                          <Slider
                            label="Text opacity"
                            min={0}
                            max={1}
                            value={selectedText.opacity ?? 1}
                            onChange={(v) => patchText(selectedText.id, { opacity: v })}
                          />
                          <Slider
                            label="Letter spacing"
                            min={0}
                            max={40}
                            value={selectedText.letterSpacing ?? 0}
                            onChange={(v) => patchText(selectedText.id, { letterSpacing: v })}
                          />
                          <Slider
                            label="Line height"
                            min={0.8}
                            max={2}
                            value={selectedText.lineHeight ?? 1.1}
                            onChange={(v) => patchText(selectedText.id, { lineHeight: v })}
                          />
                          <Slider
                            label="Duration"
                            min={0.5}
                            max={20}
                            value={selectedText.duration}
                            onChange={(v) => patchText(selectedText.id, { duration: v })}
                          />
                          <p className="tool-hint">
                            Drag the block on the text lane to move it, or drag its edges to resize.
                          </p>
                          <button className="btn tiny danger" onClick={() => deleteText(selectedText.id)}>
                            Delete text
                          </button>
                          </InspSection>
                        </>
                      ) : (
                        <p className="tool-hint">Add a text block, then select it on the text lane to style it.</p>
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
                      <p className="tool-label">Transition preview</p>
                      <TransitionDemo kind={previewTransition} replayKey={demoKey} />
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
                      <div className="chip-row">
                        {TRANSITIONS.filter(
                          (t) =>
                            t.id !== "none" &&
                            (!trSearch.trim() || t.label.toLowerCase().includes(trSearch.toLowerCase())),
                        ).map((tr) => (
                          <TransitionChip
                            key={tr.id}
                            tr={tr}
                            active={
                              previewTransition === tr.id ||
                              selectedClip?.transition === tr.id
                            }
                            fav={favTr.includes(tr.id)}
                            onPick={() => {
                              setPreviewTransition(tr.id);
                              setDemoKey((k) => k + 1);
                              if (selectedClip) {
                                patchClip(selectedClip.id, { transition: tr.id });
                              } else {
                                // preview only when nothing selected
                              }
                            }}
                            onFav={() => toggleFav(tr.id)}
                          />
                        ))}
                      </div>
                      <div className="apply-row">
                        <button
                          className="btn tiny"
                          onClick={() => setDemoKey((k) => k + 1)}
                          title="Replay preview"
                        >
                          ↻ Replay
                        </button>
                        <p className="tool-hint">
                          {selectedClip
                            ? "Click a transition to apply it."
                            : "Select a clip, then click a transition."}
                        </p>
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

/** Clip basics — speed, opacity, transition length, lane actions. */
export function ClipPanel({ ctx }: { ctx: InspectorPanelCtx }) {
  const { selectedClip, selectedText, patchClip, patchText } = panelCtx(ctx);
  if (selectedText && !selectedClip) {
    return (
      <div className="tool">
        <p className="tool-hint">Text layer selected — edit in the Text library tab.</p>
        <Slider
          label="Start"
          min={0}
          max={120}
          value={selectedText.start}
          onChange={(v) => patchText(selectedText.id, { start: v })}
        />
        <Slider
          label="Duration"
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
        <p className="tool-hint">Select a clip on the timeline to edit its properties.</p>
        {ctx.addAdjustmentLayer && (
          <button className="btn tiny wide" onClick={ctx.addAdjustmentLayer}>
            Add adjustment layer
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="tool">
      <InspSection id="clip-basic" title="Clip" filterMatch={inspMatch(ctx.inspSearch || "", "speed", "opacity", "clip")}>
        <Slider
          label="Speed"
          min={0.1}
          max={4}
          value={selectedClip.speed || 1}
          onChange={(v) => patchClip(selectedClip.id, { speed: v })}
        />
        {ctx.applySpeedRamp && (
          <div className="chip-row" style={{ marginBottom: "0.45rem" }}>
            {(
              [
                ["ramp-in", "Ramp in"],
                ["ramp-out", "Ramp out"],
                ["slow-mo", "Slow-mo"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className="chip"
                onClick={() => ctx.applySpeedRamp?.(selectedClip.id, kind)}
              >
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
        <Slider
          label="Opacity"
          min={0}
          max={1}
          value={selectedClip.transform?.opacity ?? 1}
          onChange={(v) =>
            patchClip(selectedClip.id, {
              transform: {
                ...DEFAULT_TRANSFORM,
                ...(selectedClip.transform || {}),
                opacity: v,
              },
            })
          }
        />
        {selectedClip.transition !== "none" && (
          <Slider
            label="Transition length"
            min={0.05}
            max={2}
            value={selectedClip.transitionDuration || 0.5}
            onChange={(v) => patchClip(selectedClip.id, { transitionDuration: v })}
          />
        )}
      </InspSection>
      <InspectorClipActions ctx={ctx} />
    </div>
  );
}

export function InspectorTabPanels({ ctx }: { ctx: InspectorPanelCtx }) {
  const { tab } = ctx;
  /**
   * Inspector (right): clip | transform | color | audio | effects | animation
   * Sidebar still mounts text | transitions | fx via the same switch.
   */
  if (tab === "clip") return <ClipPanel ctx={ctx} />;
  if (tab === "transform" || tab === "animation") return <TransformPanel ctx={ctx} />;
  if (tab === "color") return <EffectsPanel ctx={ctx} />;
  if (tab === "audio") return <AudioPanel ctx={ctx} />;
  if (tab === "effects" || tab === "fx") return <FxPanel ctx={ctx} />;
  if (tab === "text") return <TextPanel ctx={ctx} />;
  if (tab === "transitions") return <TransitionsPanel ctx={ctx} />;
  return <ClipPanel ctx={ctx} />;
}

"use client";

import { useState } from "react";
import { StudioSlider as Slider } from "@/components/editor/StudioSlider";
import { BezierEditor } from "@/components/editor/BezierEditor";
import { ColorWheelsRow, HueColorWheel } from "@/components/editor/ColorWheels";
import { TransitionChip } from "@/components/editor/TransitionWidgets";
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
  type EffectKind,
  type KeyframeEase,
  type KeyframeProp,
  type ProjectAsset,
  type TransitionKind,
} from "@/lib/editor-types";
import { InspSection, PanelBlock, inspMatch } from "@/components/editor/InspSection";
import { AudioMixerStrip } from "@/components/editor/AudioMixerStrip";
import { KeyframeGraph } from "@/components/editor/KeyframeGraph";
import { panelCtx, type InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";

const TRANSITION_UI = new Set<string>(TRANSITION_UI_IDS);
const TRANSITIONS = TRANSITION_DEFS.filter(
  (t) => t.id === "none" || TRANSITION_UI.has(t.id),
);

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


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


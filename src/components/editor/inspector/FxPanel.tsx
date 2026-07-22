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

